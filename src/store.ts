import { Notice, TAbstractFile, TFile, TFolder, type App } from "obsidian";
import {
	DAILY_REPORT_DIR,
	dailyReportNotePath,
	draftToArchivePayload,
	extractTomorrowPlanLines,
	isDailyDraftWorthArchiving,
	prevDateStr,
	serializeDailyReportNote,
} from "./daily-archive";
import { appendTaskLog, parseTaskMarkdown, serializeTaskMarkdown } from "./markdown";
import {
	TYPE_DIR,
	sanitizeFileName,
	todayStr,
	type DailyReportDraftSettings,
	type Task,
	type TaskStatus,
	type TaskType,
	type ZTaskingSettings,
} from "./model";
import {
	DEFAULT_PROJECT,
	isLegacyTaskPath,
	isTaskPath,
	listProjectNames,
	needsLegacyMigration,
	normalizeProjectName,
	projectFromPath,
	taskDir,
} from "./project";

export class TaskStore {
	tasks: Task[] = [];
	/** 根下已知业务项目（含默认 KVAD） */
	projects: string[] = [DEFAULT_PROJECT];
	/** >0 时忽略 vault 监听刷新，避免迁移/建目录时重入 */
	private muteDepth = 0;

	constructor(private app: App, private getSettings: () => ZTaskingSettings) {}

	get isMuted(): boolean {
		return this.muteDepth > 0;
	}

	private beginMute(): void {
		this.muteDepth += 1;
	}

	private endMute(): void {
		this.muteDepth = Math.max(0, this.muteDepth - 1);
	}

	root(): string {
		return this.getSettings().rootFolder.replace(/\/+$/, "");
	}

	dir(project: string, type: TaskType): string {
		return taskDir(this.root(), project, type);
	}

	dailyDir(): string {
		return `${this.root()}/${DAILY_REPORT_DIR}`;
	}

	private async ensureFolder(path: string): Promise<void> {
		if (this.app.vault.getAbstractFileByPath(path)) return;
		try {
			await this.app.vault.createFolder(path);
		} catch {
			/* 并发创建时可能已存在 */
		}
	}

	async ensureProjectFolders(project: string): Promise<void> {
		await this.ensureFolder(this.root());
		await this.ensureFolder(`${this.root()}/${project}`);
		for (const type of Object.keys(TYPE_DIR) as TaskType[]) {
			await this.ensureFolder(this.dir(project, type));
		}
	}

	async ensureFolders(): Promise<void> {
		await this.ensureProjectFolders(DEFAULT_PROJECT);
		for (const p of this.projects) {
			if (p !== DEFAULT_PROJECT) await this.ensureProjectFolders(p);
		}
	}

	async ensureDailyFolder(): Promise<void> {
		await this.ensureFolder(this.root());
		await this.ensureFolder(this.dailyDir());
	}

	isTaskFile(path: string): boolean {
		const dailyPrefix = `${this.dailyDir()}/`;
		if (path.startsWith(dailyPrefix)) return false;
		return isTaskPath(this.root(), path) || isLegacyTaskPath(this.root(), path);
	}

	private rootChildNames(): string[] {
		const rootFile = this.app.vault.getAbstractFileByPath(this.root());
		if (!(rootFile instanceof TFolder)) return [];
		return rootFile.children.map((c) => c.name);
	}

	/**
	 * 将根下旧结构 长期|临时|缺陷 迁入 KVAD/对应类型。
	 * 优先整夹改名；目标已存在则逐文件并入。
	 */
	async migrateLegacyLayout(): Promise<boolean> {
		const children = this.rootChildNames();
		if (!needsLegacyMigration(children)) return false;
		await this.ensureFolder(this.root());
		await this.ensureFolder(`${this.root()}/${DEFAULT_PROJECT}`);
		let moved = false;
		for (const type of Object.keys(TYPE_DIR) as TaskType[]) {
			const typeName = TYPE_DIR[type];
			const oldPath = `${this.root()}/${typeName}`;
			const oldFolder = this.app.vault.getAbstractFileByPath(oldPath);
			if (!(oldFolder instanceof TFolder)) continue;
			const destDir = this.dir(DEFAULT_PROJECT, type);
			const destExisting = this.app.vault.getAbstractFileByPath(destDir);
			try {
				if (!destExisting) {
					await this.app.fileManager.renameFile(oldFolder, destDir);
					moved = true;
					continue;
				}
				if (!(destExisting instanceof TFolder)) continue;
				for (const child of [...oldFolder.children]) {
					if (!(child instanceof TFile)) continue;
					const dest = `${destDir}/${child.name}`;
					if (this.app.vault.getAbstractFileByPath(dest)) continue;
					await this.app.fileManager.renameFile(child, dest);
					moved = true;
				}
				const refreshed = this.app.vault.getAbstractFileByPath(oldPath);
				if (refreshed instanceof TFolder && refreshed.children.length === 0) {
					await this.app.vault.delete(refreshed);
				}
			} catch (err) {
				console.error("Z-Tasking migrateLegacyLayout", typeName, err);
			}
		}
		return moved;
	}

	refreshProjectList(): void {
		this.projects = listProjectNames(this.rootChildNames());
	}

	/** 将日报草稿写入 vault：根目录/日报/YYYY-MM-DD.md（有内容才写） */
	async upsertDailyReportArchive(draft: DailyReportDraftSettings): Promise<string | null> {
		if (!draft.date || !isDailyDraftWorthArchiving(draft)) return null;
		await this.ensureDailyFolder();
		const path = dailyReportNotePath(this.root(), draft.date);
		const content = serializeDailyReportNote(draftToArchivePayload(draft));
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else if (!existing) {
			await this.app.vault.create(path, content);
		}
		return path;
	}

	/** 读取昨日日报中的「明日计划」条目 */
	async readYesterdayPlan(): Promise<{ path: string | null; items: string[] }> {
		const date = prevDateStr(todayStr());
		const path = dailyReportNotePath(this.root(), date);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return { path: null, items: [] };
		const md = await this.app.vault.read(file);
		return { path, items: extractTomorrowPlanLines(md) };
	}

	async reload(): Promise<void> {
		this.beginMute();
		try {
			await this.ensureFolder(this.root());
			const migrated = await this.migrateLegacyLayout();
			this.refreshProjectList();
			await this.ensureFolders();
			const files = this.app.vault.getMarkdownFiles().filter((f) => this.isTaskFile(f.path));
			const tasks: Task[] = [];
			for (const file of files) {
				const content = await this.app.vault.read(file);
				const task = parseTaskMarkdown(file.path, content, this.root());
				task.updatedAt = file.stat.mtime;
				tasks.push(task);
			}
			tasks.sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, "zh"));
			this.tasks = tasks;
			this.refreshProjectList();
			if (migrated) {
				new Notice(`已将旧任务目录迁入 ${DEFAULT_PROJECT}/`);
			}
		} finally {
			this.endMute();
		}
	}

	private async uniquePath(project: string, type: TaskType, title: string, exclude?: string): Promise<string> {
		await this.ensureProjectFolders(project);
		const base = sanitizeFileName(title);
		let path = `${this.dir(project, type)}/${base}.md`;
		let i = 2;
		while (true) {
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (!existing || existing.path === exclude) return path;
			path = `${this.dir(project, type)}/${base}-${i}.md`;
			i += 1;
		}
	}

	async create(input: Omit<Task, "id" | "path" | "logs" | "updatedAt"> & { logs?: Task["logs"] }): Promise<Task> {
		const project = input.project?.trim() || DEFAULT_PROJECT;
		const path = await this.uniquePath(project, input.type, input.title);
		const task: Task = {
			...input,
			project,
			id: path,
			path,
			logs: input.logs ?? [],
			updatedAt: Date.now(),
		};
		await this.app.vault.create(path, serializeTaskMarkdown(task));
		await this.reload();
		return this.tasks.find((t) => t.path === path) ?? task;
	}

	async save(task: Task): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(task.path);
		if (!(file instanceof TFile)) return task.path;
		const project = task.project?.trim() || projectFromPath(this.root(), task.path);
		const nextPath = await this.uniquePath(project, task.type, task.title, task.path);
		await this.app.vault.modify(file, serializeTaskMarkdown({ ...task, project, path: nextPath, id: nextPath }));
		if (nextPath !== task.path) {
			await this.app.fileManager.renameFile(file, nextPath);
		}
		await this.reload();
		return nextPath;
	}

	async setStatus(task: Task, status: TaskStatus): Promise<string> {
		return this.save({ ...task, status });
	}

	async setType(task: Task, type: TaskType): Promise<string> {
		return this.save({ ...task, type });
	}

	async setProject(task: Task, project: string): Promise<string> {
		const next = project.trim() || DEFAULT_PROJECT;
		return this.save({ ...task, project: next });
	}

	/** 创建空业务项目目录（长期/临时/缺陷）；已存在则仍确保子目录齐全。 */
	async createProject(rawName: string): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
		const name = normalizeProjectName(rawName);
		if (!name) {
			return { ok: false, reason: "项目名无效（不能为空，也不能是「日报 / 长期 / 临时 / 缺陷」）" };
		}
		this.beginMute();
		try {
			await this.ensureProjectFolders(name);
			this.refreshProjectList();
			if (!this.projects.includes(name)) {
				this.projects = listProjectNames([...this.rootChildNames(), name]);
			}
			return { ok: true, name };
		} finally {
			this.endMute();
		}
	}

	async setTitle(task: Task, title: string): Promise<string> {
		const next = title.trim();
		if (!next) return task.path;
		return this.save({ ...task, title: next });
	}

	async setDesc(task: Task, desc: string): Promise<string> {
		return this.save({ ...task, desc });
	}

	async addLog(task: Task, date: string, text: string, hours: number): Promise<string> {
		const logs = appendTaskLog(task.logs, date, text, hours);
		const status = task.status === "todo" ? "doing" : task.status;
		return this.save({ ...task, logs, status });
	}

	async updateLog(task: Task, date: string, text: string, hours: number): Promise<string> {
		const logs = task.logs.map((l) => l.date === date ? { ...l, text, hours } : l);
		return this.save({ ...task, logs });
	}

	async deleteLog(task: Task, date: string): Promise<string> {
		return this.save({ ...task, logs: task.logs.filter((l) => l.date !== date) });
	}

	/** 删除整条任务笔记文件，并刷新列表。 */
	async deleteTask(task: Task): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(task.path);
		if (file instanceof TFile) {
			await this.app.vault.delete(file);
		}
		await this.reload();
	}
}

export function isInTaskFolder(file: TAbstractFile | null, root: string): boolean {
	if (!file) return false;
	return file.path === root || file.path.startsWith(`${root}/`);
}

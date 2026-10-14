import { Notice, TAbstractFile, TFile, TFolder, type App } from "obsidian";
import {
	DAILY_REPORT_DIR,
	dailyReportNotePath,
	draftToArchivePayload,
	extractYesterdayPlanState,
	isDailyDraftWorthArchiving,
	prevDateStr,
	replaceTomorrowPlanSection,
	serializeDailyReportNote,
	type YesterdayPlanItem,
} from "./daily-archive";
import { DEFAULT_DAILY_DISCUSS } from "./daily-report";
import { appendTaskLog, parseTaskMarkdown, relocateTaskLog, serializeTaskMarkdown } from "./markdown";
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
	DEFAULT_BRANCH,
	DEFAULT_PROJECT,
	branchFromPath,
	canDeleteBranch,
	canDeleteProject,
	isLegacyTaskPath,
	isMidLegacyTaskPath,
	isReservedRootName,
	isTaskPath,
	isTypeDirName,
	listBranchNames,
	listProjectNames,
	needsLegacyMigration,
	normalizeBranchName,
	normalizeProjectName,
	prepareRenameBranch,
	prepareRenameProject,
	projectFromPath,
	rootFolderNamesFromListing,
	suggestSplitProjectName,
	taskDir,
} from "./project";

export class TaskStore {
	tasks: Task[] = [];
	/** 根下已知业务项目（含默认 KVAD） */
	projects: string[] = [DEFAULT_PROJECT];
	/** 当前选中项目下的分支名缓存（刷新任务后更新） */
	branchesByProject: Record<string, string[]> = {};
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

	dir(project: string, branch: string, type: TaskType): string {
		return taskDir(this.root(), project, branch, type);
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

	async ensureBranchFolders(project: string, branch: string): Promise<void> {
		const b = branch.trim() || DEFAULT_BRANCH;
		await this.ensureFolder(this.root());
		await this.ensureFolder(`${this.root()}/${project}`);
		await this.ensureFolder(`${this.root()}/${project}/${b}`);
		for (const type of Object.keys(TYPE_DIR) as TaskType[]) {
			await this.ensureFolder(this.dir(project, b, type));
		}
	}

	async ensureProjectFolders(project: string): Promise<void> {
		await this.ensureBranchFolders(project, DEFAULT_BRANCH);
	}

	async ensureFolders(): Promise<void> {
		await this.ensureFolder(this.root());
		const names = this.projects.length ? this.projects : [DEFAULT_PROJECT];
		for (const p of names) {
			await this.ensureProjectFolders(p);
		}
	}

	async ensureDailyFolder(): Promise<void> {
		await this.ensureFolder(this.root());
		await this.ensureFolder(this.dailyDir());
	}

	isTaskFile(path: string): boolean {
		const dailyPrefix = `${this.dailyDir()}/`;
		if (path.startsWith(dailyPrefix)) return false;
		const root = this.root();
		return (
			isTaskPath(root, path)
			|| isMidLegacyTaskPath(root, path)
			|| isLegacyTaskPath(root, path)
		);
	}

	private rootChildNamesFromIndex(): string[] {
		const rootFile = this.app.vault.getAbstractFileByPath(this.root());
		if (!(rootFile instanceof TFolder)) return [];
		return rootFile.children.filter((c) => c instanceof TFolder).map((c) => c.name);
	}

	/** 优先 adapter.list 扫磁盘；失败再回落 vault 索引（空目录重启后常丢） */
	private async listRootChildNames(): Promise<string[]> {
		const root = this.root();
		try {
			const listed = await this.app.vault.adapter.list(root);
			const fromDisk = rootFolderNamesFromListing(root, listed.folders ?? []);
			if (fromDisk.length) return fromDisk;
		} catch {
			/* adapter 不可用或根不存在 */
		}
		return this.rootChildNamesFromIndex();
	}

	/**
	 * 将根下旧结构 长期|临时|缺陷 迁入 KVAD/对应类型。
	 * 优先整夹改名；目标已存在则逐文件并入。
	 */
	async migrateLegacyLayout(): Promise<boolean> {
		const children = await this.listRootChildNames();
		if (!needsLegacyMigration(children)) return false;
		await this.ensureFolder(this.root());
		await this.ensureFolder(`${this.root()}/${DEFAULT_PROJECT}`);
		let moved = false;
		for (const type of Object.keys(TYPE_DIR) as TaskType[]) {
			const typeName = TYPE_DIR[type];
			const oldPath = `${this.root()}/${typeName}`;
			const oldFolder = this.app.vault.getAbstractFileByPath(oldPath);
			if (!(oldFolder instanceof TFolder)) continue;
			const destDir = this.dir(DEFAULT_PROJECT, DEFAULT_BRANCH, type);
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

	/**
	 * 将 根/项目/类型 迁入 根/项目/分支/类型。
	 * 项目名含「 - 」时拆成 项目+分支；否则迁入 main。
	 */
	async migrateBranchLayout(): Promise<{ ran: boolean; moved: boolean }> {
		const settings = this.getSettings();
		if (settings.branchPathMigrated) return { ran: false, moved: false };
		const projects = await this.listRootChildNames();
		let moved = false;
		for (const rawName of projects) {
			if (isReservedRootName(rawName)) continue;
			const children = await this.listProjectChildNames(rawName);
			const typeChildren = children.filter((c) => isTypeDirName(c));
			if (!typeChildren.length) continue;

			const split = suggestSplitProjectName(rawName);
			const targetProject = split?.project ?? rawName;
			const targetBranch = split?.branch ?? DEFAULT_BRANCH;
			await this.ensureBranchFolders(targetProject, targetBranch);

			for (const typeName of typeChildren) {
				const type = (Object.keys(TYPE_DIR) as TaskType[]).find((k) => TYPE_DIR[k] === typeName);
				if (!type) continue;
				const oldPath = `${this.root()}/${rawName}/${typeName}`;
				const oldFolder = this.app.vault.getAbstractFileByPath(oldPath);
				if (!(oldFolder instanceof TFolder)) continue;
				const destDir = this.dir(targetProject, targetBranch, type);
				try {
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
					console.error("Z-Tasking migrateBranchLayout", oldPath, err);
				}
			}

			if (split && rawName !== targetProject) {
				const oldProjectPath = `${this.root()}/${rawName}`;
				const oldFolder = this.app.vault.getAbstractFileByPath(oldProjectPath);
				if (oldFolder instanceof TFolder) {
					// 迁材料目录
					const mat = oldFolder.children.find((c) => c.name === "_资料");
					if (mat) {
						const destMat = `${this.root()}/${targetProject}/_资料`;
						if (!this.app.vault.getAbstractFileByPath(destMat)) {
							try {
								await this.app.fileManager.renameFile(mat, destMat);
								moved = true;
							} catch (err) {
								console.error("Z-Tasking migrate materials", err);
							}
						}
					}
					const refreshed = this.app.vault.getAbstractFileByPath(oldProjectPath);
					if (refreshed instanceof TFolder) {
						const leftover = refreshed.children.filter(
							(c) => !(c instanceof TFile && c.name === "_ztasking-project.md"),
						);
						if (leftover.length === 0) {
							try {
								await this.app.vault.delete(refreshed, true);
							} catch (err) {
								console.error("Z-Tasking remove split project", rawName, err);
							}
						}
					}
				}
			}
		}
		settings.branchPathMigrated = true;
		return { ran: true, moved };
	}

	async createBranch(
		project: string,
		rawName: string,
	): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
		const p = project.trim();
		const name = normalizeBranchName(rawName);
		if (!p || isReservedRootName(p)) {
			return { ok: false, reason: "项目无效" };
		}
		if (!name) {
			return { ok: false, reason: "分支名无效（不能是日报/类型/_资料）" };
		}
		const existing = this.branchesOf(p);
		if (existing.includes(name)) {
			await this.ensureBranchFolders(p, name);
			return { ok: true, name };
		}
		this.beginMute();
		try {
			await this.ensureBranchFolders(p, name);
			await this.refreshBranchesByProject();
			return { ok: true, name };
		} finally {
			this.endMute();
		}
	}

	async renameBranch(
		project: string,
		from: string,
		rawTo: string,
	): Promise<{ ok: true; from: string; to: string } | { ok: false; reason: string }> {
		const p = project.trim();
		const prepared = prepareRenameBranch(from, rawTo, this.branchesOf(p));
		if (!prepared.ok) return prepared;
		const oldPath = `${this.root()}/${p}/${prepared.from}`;
		const newPath = `${this.root()}/${p}/${prepared.to}`;
		const folder = this.app.vault.getAbstractFileByPath(oldPath);
		if (!(folder instanceof TFolder)) {
			return { ok: false, reason: `找不到分支目录「${prepared.from}」` };
		}
		if (this.app.vault.getAbstractFileByPath(newPath)) {
			return { ok: false, reason: `已存在分支「${prepared.to}」` };
		}
		this.beginMute();
		try {
			await this.app.fileManager.renameFile(folder, newPath);
			await this.reload();
			return { ok: true, from: prepared.from, to: prepared.to };
		} catch (err) {
			console.error("Z-Tasking renameBranch", oldPath, err);
			return { ok: false, reason: "重命名失败" };
		} finally {
			this.endMute();
		}
	}

	async deleteBranch(
		project: string,
		branch: string,
	): Promise<{ ok: true } | { ok: false; reason: string }> {
		const check = canDeleteBranch(project, branch, this.tasks);
		if (!check.ok) return check;
		const folder = this.app.vault.getAbstractFileByPath(`${this.root()}/${project.trim()}/${branch.trim()}`);
		if (!(folder instanceof TFolder)) {
			await this.refreshBranchesByProject();
			return { ok: false, reason: `找不到分支「${branch.trim()}」` };
		}
		this.beginMute();
		try {
			await this.app.vault.delete(folder, true);
			await this.refreshBranchesByProject();
			return { ok: true };
		} catch (err) {
			console.error("Z-Tasking deleteBranch", branch, err);
			return { ok: false, reason: "删除失败" };
		} finally {
			this.endMute();
		}
	}

	async refreshProjectList(): Promise<void> {
		const fromFolders = await this.listRootChildNames();
		const fromTasks = this.tasks.map((t) => t.project).filter(Boolean);
		this.projects = listProjectNames([...fromFolders, ...fromTasks]);
		await this.refreshBranchesByProject();
	}

	async listProjectChildNames(project: string): Promise<string[]> {
		const path = `${this.root()}/${project.trim()}`;
		try {
			const listed = await this.app.vault.adapter.list(path);
			return rootFolderNamesFromListing(path, listed.folders ?? []);
		} catch {
			const folder = this.app.vault.getAbstractFileByPath(path);
			if (!(folder instanceof TFolder)) return [];
			return folder.children.filter((c) => c instanceof TFolder).map((c) => c.name);
		}
	}

	async refreshBranchesByProject(): Promise<void> {
		const map: Record<string, string[]> = {};
		for (const project of this.projects) {
			const children = await this.listProjectChildNames(project);
			const fromDisk = listBranchNames(children);
			const fromTasks = this.tasks.filter((t) => t.project === project).map((t) => t.branch);
			map[project] = listBranchNames([...fromDisk, ...fromTasks]);
		}
		this.branchesByProject = map;
	}

	branchesOf(project: string): string[] {
		return this.branchesByProject[project.trim()] ?? [DEFAULT_BRANCH];
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

	/** 读取指定日报日期中的「明日计划」条目（含重置基线）；默认昨天 */
	async readYesterdayPlan(reportDate?: string): Promise<{
		path: string | null;
		items: YesterdayPlanItem[];
		baseline: YesterdayPlanItem[];
		reportDate: string;
	}> {
		const date = (reportDate?.trim() || prevDateStr(todayStr()));
		const path = dailyReportNotePath(this.root(), date);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return { path: null, items: [], baseline: [], reportDate: date };
		const md = await this.app.vault.read(file);
		const state = extractYesterdayPlanState(md);
		const baseline = (state.baseline !== null ? state.baseline : state.items).map((it) => ({ ...it }));
		return { path, items: state.items, baseline, reportDate: date };
	}

	/** 写回指定日报日期的「明日计划」段（可新建空日报）；默认昨天 */
	async writeYesterdayPlan(
		items: YesterdayPlanItem[],
		baseline: YesterdayPlanItem[],
		reportDate?: string,
	): Promise<string> {
		const date = (reportDate?.trim() || prevDateStr(todayStr()));
		await this.ensureDailyFolder();
		const path = dailyReportNotePath(this.root(), date);
		const file = this.app.vault.getAbstractFileByPath(path);
		const emptyMd = serializeDailyReportNote({
			date,
			work: "",
			plan: "",
			discuss: DEFAULT_DAILY_DISCUSS,
		});
		if (!(file instanceof TFile)) {
			const md = replaceTomorrowPlanSection(emptyMd, items, baseline);
			await this.app.vault.create(path, md);
			return path;
		}
		const md = await this.app.vault.read(file);
		await this.app.vault.modify(file, replaceTomorrowPlanSection(md, items, baseline));
		return path;
	}

	/** @returns settingsDirty — 调用方应 saveSettings（如首次分支路径迁移打标） */
	async reload(): Promise<{ settingsDirty: boolean }> {
		this.beginMute();
		let settingsDirty = false;
		try {
			await this.ensureFolder(this.root());
			const migratedFlat = await this.migrateLegacyLayout();
			const branchMig = await this.migrateBranchLayout();
			settingsDirty = branchMig.ran;
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
			await this.pruneOrphanScaffoldProjects();
			await this.refreshProjectList();
			await this.ensureFolders();
			if (migratedFlat) {
				new Notice(`已将旧任务目录迁入 ${DEFAULT_PROJECT}/`);
			}
			if (branchMig.moved) {
				new Notice("已将任务迁入「项目/分支」目录结构");
			}
		} finally {
			this.endMute();
		}
		return { settingsDirty };
	}

	/**
	 * 清理「无任务且无建项占位」的空项目夹（多为改名/强制重建残留）。
	 * 保留 createProject 写下的 _ztasking-project.md 空项目。
	 */
	private async pruneOrphanScaffoldProjects(): Promise<void> {
		const children = await this.listRootChildNames();
		for (const name of children) {
			if (isReservedRootName(name)) continue;
			if (this.tasks.some((t) => t.project === name)) continue;
			const projectPath = `${this.root()}/${name}`;
			if (this.app.vault.getAbstractFileByPath(`${projectPath}/_ztasking-project.md`)) continue;
			const folder = this.app.vault.getAbstractFileByPath(projectPath);
			if (!(folder instanceof TFolder)) continue;
			try {
				await this.app.vault.delete(folder, true);
			} catch (err) {
				console.error("Z-Tasking pruneOrphanScaffoldProjects", name, err);
			}
		}
	}

	private async uniquePath(
		project: string,
		branch: string,
		type: TaskType,
		title: string,
		exclude?: string,
	): Promise<string> {
		const b = branch.trim() || DEFAULT_BRANCH;
		await this.ensureBranchFolders(project, b);
		const base = sanitizeFileName(title);
		let path = `${this.dir(project, b, type)}/${base}.md`;
		let i = 2;
		while (true) {
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (!existing || existing.path === exclude) return path;
			path = `${this.dir(project, b, type)}/${base}-${i}.md`;
			i += 1;
		}
	}

	async create(input: Omit<Task, "id" | "path" | "logs" | "updatedAt"> & { logs?: Task["logs"] }): Promise<Task> {
		const project = input.project?.trim() || DEFAULT_PROJECT;
		const branch = input.branch?.trim() || DEFAULT_BRANCH;
		const path = await this.uniquePath(project, branch, input.type, input.title);
		const task: Task = {
			...input,
			project,
			branch,
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
		const branch = task.branch?.trim() || branchFromPath(this.root(), task.path);
		const nextPath = await this.uniquePath(project, branch, task.type, task.title, task.path);
		await this.app.vault.modify(
			file,
			serializeTaskMarkdown({ ...task, project, branch, path: nextPath, id: nextPath }),
		);
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
		const oldProject = (task.project?.trim() || projectFromPath(this.root(), task.path)).trim();
		const next = project.trim() || DEFAULT_PROJECT;
		const branch = task.branch?.trim() || branchFromPath(this.root(), task.path);
		const path = await this.save({ ...task, project: next, branch });
		if (oldProject && oldProject !== next) {
			await this.pruneProjectIfNoTasks(oldProject);
			await this.refreshProjectList();
		}
		return path;
	}

	async setBranch(task: Task, branch: string): Promise<string> {
		const next = normalizeBranchName(branch) || DEFAULT_BRANCH;
		return this.save({ ...task, branch: next });
	}

	/** 项目下已无任务笔记时删掉空项目夹（含占位文件与空类型目录），避免改名后残留旧项目 */
	private async pruneProjectIfNoTasks(project: string): Promise<void> {
		const name = project.trim();
		if (!name || isReservedRootName(name)) return;
		if (this.tasks.some((t) => t.project === name)) return;
		const prefix = `${this.root()}/${name}/`;
		if (this.tasks.some((t) => t.path.startsWith(prefix))) return;
		const folder = this.app.vault.getAbstractFileByPath(`${this.root()}/${name}`);
		if (!(folder instanceof TFolder)) return;
		this.beginMute();
		try {
			await this.app.vault.delete(folder, true);
		} catch (err) {
			console.error("Z-Tasking pruneProjectIfNoTasks", name, err);
		} finally {
			this.endMute();
		}
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
			// 空目录 Obsidian 重启后常不进索引；落一个占位笔记保证可发现
			await this.ensureProjectPlaceholder(name);
			await this.refreshProjectList();
			if (!this.projects.includes(name)) {
				const children = await this.listRootChildNames();
				this.projects = listProjectNames([...children, name]);
			}
			return { ok: true, name };
		} finally {
			this.endMute();
		}
	}

	/** 重命名项目文件夹；任务 path 随目录变更，调用方需同步 sidebarOrder */
	async renameProject(
		from: string,
		rawTo: string,
	): Promise<{ ok: true; from: string; to: string } | { ok: false; reason: string }> {
		const prepared = prepareRenameProject(from, rawTo, this.projects);
		if (!prepared.ok) return prepared;
		const { from: oldName, to } = prepared;
		const oldPath = `${this.root()}/${oldName}`;
		const newPath = `${this.root()}/${to}`;
		const folder = this.app.vault.getAbstractFileByPath(oldPath);
		if (!(folder instanceof TFolder)) {
			return { ok: false, reason: `找不到项目目录「${oldName}」` };
		}
		if (this.app.vault.getAbstractFileByPath(newPath)) {
			return { ok: false, reason: `已存在项目「${to}」` };
		}
		this.beginMute();
		try {
			await this.app.fileManager.renameFile(folder, newPath);
			await this.reload();
			return { ok: true, from: oldName, to };
		} catch (err) {
			console.error("Z-Tasking renameProject", oldName, to, err);
			return { ok: false, reason: "重命名失败，请查看控制台" };
		} finally {
			this.endMute();
		}
	}

	/** 删除空项目目录；有任务时拒绝（规则 A） */
	async deleteProject(name: string): Promise<{ ok: true } | { ok: false; reason: string }> {
		const check = canDeleteProject(name, this.tasks);
		if (!check.ok) return check;
		const folder = this.app.vault.getAbstractFileByPath(`${this.root()}/${name.trim()}`);
		if (!(folder instanceof TFolder)) {
			await this.refreshProjectList();
			return { ok: false, reason: `找不到项目目录「${name.trim()}」` };
		}
		this.beginMute();
		try {
			await this.app.vault.delete(folder, true);
			await this.refreshProjectList();
			return { ok: true };
		} catch (err) {
			console.error("Z-Tasking deleteProject", name, err);
			return { ok: false, reason: "删除失败，请查看控制台" };
		} finally {
			this.endMute();
		}
	}

	/** 在项目根写占位笔记，避免空项目夹重启后从 vault 索引消失（勿用点号文件，Obsidian 会忽略） */
	private async ensureProjectPlaceholder(project: string): Promise<void> {
		const path = `${this.root()}/${project}/_ztasking-project.md`;
		if (this.app.vault.getAbstractFileByPath(path)) return;
		try {
			await this.app.vault.create(
				path,
				[
					"---",
					"type: ztasking-project",
					`project: ${project}`,
					"---",
					"",
					`# ${project}`,
					"",
					"此文件由 Z-Tasking 自动创建，用于保留空项目目录；可删，删后请至少保留一条任务笔记。",
					"",
				].join("\n"),
			);
		} catch {
			/* 并发创建 */
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

	async addLog(task: Task, date: string, text: string, hours: number, bumpStatus = true): Promise<string> {
		const logs = appendTaskLog(task.logs, date, text, hours);
		const status = bumpStatus && task.status === "todo" ? "doing" : task.status;
		return this.save({ ...task, logs, status });
	}

	async updateLog(task: Task, date: string, text: string, hours: number): Promise<string> {
		const logs = task.logs.map((l) => l.date === date ? { ...l, text, hours } : l);
		return this.save({ ...task, logs });
	}

	/**
	 * 保存进展编辑：可改日期、可挪到其他任务；目标日已有进展则合并。
	 * 返回目标任务 path（用作 selectedId）。
	 */
	async saveLogEdit(
		source: Task,
		oldDate: string,
		next: { date: string; text: string; hours: number },
		target: Task,
	): Promise<string> {
		const date = next.date.trim();
		const text = next.text.trim();
		if (!date || !(next.hours > 0)) return source.path;

		this.beginMute();
		try {
			const same = source.path === target.path;
			const { sourceLogs, targetLogs } = relocateTaskLog(
				source.logs,
				oldDate,
				{ date, text, hours: next.hours },
				same ? undefined : target.logs,
			);
			const write = async (task: Task, logs: Task["logs"]) => {
				const file = this.app.vault.getAbstractFileByPath(task.path);
				if (!(file instanceof TFile)) return;
				const project = task.project?.trim() || projectFromPath(this.root(), task.path);
				const branch = task.branch?.trim() || branchFromPath(this.root(), task.path);
				await this.app.vault.modify(
					file,
					serializeTaskMarkdown({ ...task, project, branch, logs, path: task.path, id: task.path }),
				);
			};
			if (same) {
				await write(source, sourceLogs);
			} else {
				await write(source, sourceLogs);
				await write(target, targetLogs);
			}
			await this.reload();
			return target.path;
		} finally {
			this.endMute();
		}
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

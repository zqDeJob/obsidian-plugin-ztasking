import { TAbstractFile, TFile, type App } from "obsidian";
import { appendTaskLog, parseTaskMarkdown, serializeTaskMarkdown } from "./markdown";
import {
	TYPE_DIR,
	sanitizeFileName,
	type Task,
	type TaskStatus,
	type TaskType,
	type ZTaskingSettings,
} from "./model";

export class TaskStore {
	tasks: Task[] = [];

	constructor(private app: App, private getSettings: () => ZTaskingSettings) {}

	root(): string {
		return this.getSettings().rootFolder.replace(/\/+$/, "");
	}

	dir(type: TaskType): string {
		return `${this.root()}/${TYPE_DIR[type]}`;
	}

	async ensureFolders(): Promise<void> {
		for (const path of [this.root(), this.dir("long"), this.dir("temp")]) {
			if (!this.app.vault.getAbstractFileByPath(path)) {
				await this.app.vault.createFolder(path);
			}
		}
	}

	isTaskFile(path: string): boolean {
		const root = this.root();
		return path.startsWith(`${this.dir("long")}/`) || path.startsWith(`${this.dir("temp")}/`)
			|| (path.startsWith(`${root}/`) && path.endsWith(".md"));
	}

	async reload(): Promise<void> {
		await this.ensureFolders();
		const files = this.app.vault.getMarkdownFiles().filter((f) => this.isTaskFile(f.path));
		const tasks: Task[] = [];
		for (const file of files) {
			const content = await this.app.vault.read(file);
			const task = parseTaskMarkdown(file.path, content);
			task.updatedAt = file.stat.mtime;
			tasks.push(task);
		}
		tasks.sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, "zh"));
		this.tasks = tasks;
	}

	private async uniquePath(type: TaskType, title: string, exclude?: string): Promise<string> {
		const base = sanitizeFileName(title);
		let path = `${this.dir(type)}/${base}.md`;
		let i = 2;
		while (true) {
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (!existing || existing.path === exclude) return path;
			path = `${this.dir(type)}/${base}-${i}.md`;
			i += 1;
		}
	}

	async create(input: Omit<Task, "id" | "path" | "logs" | "updatedAt"> & { logs?: Task["logs"] }): Promise<Task> {
		await this.ensureFolders();
		const path = await this.uniquePath(input.type, input.title);
		const task: Task = {
			...input,
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
		const nextPath = await this.uniquePath(task.type, task.title, task.path);
		await this.app.vault.modify(file, serializeTaskMarkdown({ ...task, path: nextPath, id: nextPath }));
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
}

export function isInTaskFolder(file: TAbstractFile | null, root: string): boolean {
	if (!file) return false;
	return file.path === root || file.path.startsWith(`${root}/`);
}

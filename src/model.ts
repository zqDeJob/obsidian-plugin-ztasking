export const VIEW_TYPE = "z-tasking-view";

export const STATUS_LABEL = {
	todo: "未开始",
	doing: "进行中",
	done: "已完结",
} as const;

export const TYPE_LABEL = {
	long: "长期",
	temp: "临时",
} as const;

export const TYPE_DIR = {
	long: "长期",
	temp: "临时",
} as const;

export type TaskType = keyof typeof TYPE_DIR;
export type TaskStatus = keyof typeof STATUS_LABEL;

export interface TaskLog {
	date: string;
	text: string;
	/** 花费工时（小时，小数）；旧笔记可能缺失 */
	hours?: number;
}

export interface Task {
	id: string;
	path: string;
	title: string;
	type: TaskType;
	status: TaskStatus;
	start: string;
	end: string;
	desc: string;
	logs: TaskLog[];
	/** 笔记最近修改时间（毫秒），用于侧边栏倒序 */
	updatedAt: number;
}

export interface ZTaskingSettings {
	rootFolder: string;
}

export const DEFAULT_SETTINGS: ZTaskingSettings = {
	rootFolder: "z-tasking",
};

export function pad(n: number): string {
	return String(n).padStart(2, "0");
}

export function fmt(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
	return new Date(`${s}T00:00:00`);
}

export function addDays(d: Date, n: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
}

export function todayStr(): string {
	return fmt(new Date());
}

export function daysBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function esc(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	}[c] ?? c));
}

/** 解析用户输入的工时；合法且 > 0 返回数值，否则 null */
export function parseHoursInput(raw: string): number | null {
	const t = raw.trim().replace(/h$/i, "").trim();
	if (!t) return null;
	const n = Number(t);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.round(n * 1000) / 1000;
}

/** 展示用：1.5 → 1.5h */
export function formatHours(hours: number): string {
	const n = Math.round(hours * 1000) / 1000;
	return `${n}h`;
}

export function sanitizeFileName(title: string): string {
	const name = title.replace(/[\\/:*?"<>|#^[\]]/g, "_").trim();
	return name || "未命名任务";
}

export function isStatus(v: string): v is TaskStatus {
	return v === "todo" || v === "doing" || v === "done";
}

export function isType(v: string): v is TaskType {
	return v === "long" || v === "temp";
}

export const VIEW_TYPE = "z-tasking-view";

export const STATUS_LABEL = {
	todo: "未开始",
	doing: "进行中",
	done: "已完结",
} as const;

export const TYPE_LABEL = {
	long: "长期",
	temp: "临时",
	bug: "缺陷",
} as const;

export const TYPE_DIR = {
	long: "长期",
	temp: "临时",
	bug: "缺陷",
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
	/** 业务项目（路径 根/项目/分支/类型/ 中的项目段） */
	project: string;
	/** Git/发布分支（路径中的分支段；旧数据回落 main） */
	branch: string;
	type: TaskType;
	status: TaskStatus;
	start: string;
	end: string;
	desc: string;
	logs: TaskLog[];
	/** 笔记最近修改时间（毫秒），用于侧边栏倒序 */
	updatedAt: number;
}

export interface WebBookmark {
	id: string;
	title: string;
	url: string;
}

/** 计划条目默认/空项目（昨日计划 & 明日计划共用） */
export const YP_NO_PROJECT = "无项目";

export interface TomorrowPlanNoteSettings {
	date: string;
	text: string;
}

export interface TomorrowPlanItemSettings {
	id: string;
	title: string;
	project: string;
	desc: string;
	notes: TomorrowPlanNoteSettings[];
	done: boolean;
}

export interface DailyReportDraftSettings {
	date: string;
	work: string;
	plan: string;
	planItems: TomorrowPlanItemSettings[];
	discuss: string;
	workCustom: boolean;
	planCustom: boolean;
}

export interface ZTaskingSettings {
	rootFolder: string;
	/** 常见网页书签 */
	webBookmarks: WebBookmark[];
	/** 网页页书签侧栏是否折叠 */
	webSideCollapsed: boolean;
	/** 日历页右侧「当日详情」是否折叠 */
	calDayPaneCollapsed: boolean;
	/** 「我的今天」是否按项目标记分组展示 */
	todayGroupByProject: boolean;
	/** 工作台侧栏手动顺序（按类型存任务 id）；空数组表示仍用时间倒序 */
	sidebarOrder: { long: string[]; temp: string[]; bug: string[] };
	/** 「我的今天」手动顺序（仅当天有效）；空数组表示保持原顺序 */
	todayDigestOrder: { date: string; ids: string[] };
	/** 工作台右侧任务表置顶（任务 id / path） */
	pinnedTaskIds: string[];
	/** 项目页拖拽顺序（项目名）；未入册的新项目插到最前 */
	projectOrder: string[];
	/** 项目页上次选中的项目名 */
	lastProjectId: string;
	/** 各项目下分支拖拽序 */
	branchOrderByProject: Record<string, string[]>;
	/** 各项目上次选中的分支 */
	lastBranchByProject: Record<string, string>;
	/** 是否已跑过项目→分支路径迁移 */
	branchPathMigrated: boolean;
	/** 汇总「今日日报」草稿（含明日计划待办） */
	dailyReportDraft: DailyReportDraftSettings;
}

export const DEFAULT_SETTINGS: ZTaskingSettings = {
	rootFolder: "Z-Tasking",
	webBookmarks: [
		{ id: "bm-google", title: "Google", url: "https://www.google.com/" },
		{ id: "bm-github", title: "GitHub", url: "https://github.com/" },
	],
	webSideCollapsed: false,
	calDayPaneCollapsed: false,
	todayGroupByProject: false,
	sidebarOrder: { long: [], temp: [], bug: [] },
	todayDigestOrder: { date: "", ids: [] },
	pinnedTaskIds: [],
	projectOrder: [],
	lastProjectId: "",
	branchOrderByProject: {},
	lastBranchByProject: {},
	branchPathMigrated: false,
	dailyReportDraft: {
		date: "",
		work: "",
		plan: "",
		planItems: [],
		discuss: "- 无",
		workCustom: false,
		planCustom: false,
	},
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
	return v === "long" || v === "temp" || v === "bug";
}

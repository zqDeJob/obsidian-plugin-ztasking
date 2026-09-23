import type { Task, TaskStatus, TaskType } from "./model.ts";

export type CatalogSortKey = "type" | "status" | "hours";
export type CatalogSortDir = "asc" | "desc";
export type CatalogSort = { key: CatalogSortKey; dir: CatalogSortDir } | null;

const TYPE_RANK: Record<TaskType, number> = { long: 0, temp: 1, bug: 2 };
const STATUS_RANK: Record<TaskStatus, number> = { todo: 0, doing: 1, done: 2 };

function taskHours(task: Task): number {
	return task.logs.reduce((sum, l) => sum + (l.hours ?? 0), 0);
}

/** 任务周期与日期区间是否有交集；起/止为空表示该端不限制 */
export function taskPeriodOverlaps(
	task: Pick<Task, "start" | "end">,
	rangeStart: string,
	rangeEnd: string,
): boolean {
	if (!rangeStart && !rangeEnd) return true;
	const ts = task.start || "0000-01-01";
	const te = task.end || "9999-12-31";
	const rs = rangeStart || "0000-01-01";
	const re = rangeEnd || "9999-12-31";
	return ts <= re && te >= rs;
}

/** 同列循环 none→asc→desc→none；换列从 asc 开始 */
export function nextCatalogSort(current: CatalogSort, key: CatalogSortKey): CatalogSort {
	if (!current || current.key !== key) return { key, dir: "asc" };
	if (current.dir === "asc") return { key, dir: "desc" };
	return null;
}

export function applyCatalogSort(tasks: Task[], sort: CatalogSort): Task[] {
	if (!sort) return tasks.slice();
	const dir = sort.dir === "asc" ? 1 : -1;
	const rank = (t: Task): number => {
		if (sort.key === "type") return TYPE_RANK[t.type];
		if (sort.key === "status") return STATUS_RANK[t.status];
		return taskHours(t);
	};
	return tasks.slice().sort((a, b) => {
		const d = (rank(a) - rank(b)) * dir;
		if (d !== 0) return d;
		return a.title.localeCompare(b.title, "zh");
	});
}

import type { Task, TaskStatus, TaskType } from "./model.ts";

export type CatalogSortKey = "project" | "type" | "status" | "hours";
export type CatalogSortDir = "asc" | "desc";
export type CatalogSort = { key: CatalogSortKey; dir: CatalogSortDir } | null;

const TYPE_RANK: Record<TaskType, number> = { long: 0, temp: 1, bug: 2 };
const STATUS_RANK: Record<TaskStatus, number> = { todo: 0, doing: 1, done: 2 };

function taskHours(task: Task): number {
	return task.logs.reduce((sum, l) => sum + (l.hours ?? 0), 0);
}

function projectKey(task: Task): string {
	return (task.project ?? "").trim();
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
	return tasks.slice().sort((a, b) => {
		let d = 0;
		if (sort.key === "project") {
			d = projectKey(a).localeCompare(projectKey(b), "zh") * dir;
		} else if (sort.key === "type") {
			d = (TYPE_RANK[a.type] - TYPE_RANK[b.type]) * dir;
		} else if (sort.key === "status") {
			d = (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir;
		} else {
			d = (taskHours(a) - taskHours(b)) * dir;
		}
		if (d !== 0) return d;
		return a.title.localeCompare(b.title, "zh");
	});
}

/** 置顶任务按 pinnedIds 顺序排前，其余保持传入顺序 */
export function applyPinnedFirst(tasks: Task[], pinnedIds: string[]): Task[] {
	if (!pinnedIds.length) return tasks.slice();
	const present = new Set(tasks.map((t) => t.id));
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const pinned: Task[] = [];
	for (const id of pinnedIds) {
		if (!present.has(id)) continue;
		const t = byId.get(id);
		if (t) pinned.push(t);
	}
	const pinnedSet = new Set(pinned.map((t) => t.id));
	const rest = tasks.filter((t) => !pinnedSet.has(t.id));
	return [...pinned, ...rest];
}

/** 置顶：插到列表最前；已置顶则取消 */
export function togglePinnedId(pinnedIds: string[], id: string): string[] {
	const key = id.trim();
	if (!key) return pinnedIds.slice();
	if (pinnedIds.includes(key)) return pinnedIds.filter((x) => x !== key);
	return [key, ...pinnedIds.filter((x) => x !== key)];
}

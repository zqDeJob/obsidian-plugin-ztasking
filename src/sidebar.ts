import { isStatus, type Task, type TaskStatus, type TaskType } from "./model.ts";

/** 侧栏状态筛选：全部 / 单状态 / 排除某状态（如 !done） */
export type SidebarStatusFilter = "all" | TaskStatus | `!${TaskStatus}`;

export function isSidebarStatusFilter(v: string): v is SidebarStatusFilter {
	if (v === "all") return true;
	if (v.startsWith("!")) return isStatus(v.slice(1));
	return isStatus(v);
}

export function matchSidebarStatus(status: TaskStatus, filter: SidebarStatusFilter): boolean {
	if (filter === "all") return true;
	if (filter.startsWith("!")) return status !== filter.slice(1);
	return status === filter;
}

/** 侧边栏排序键：优先笔记 mtime，否则取最近进展日期。 */
export function sidebarUpdatedAt(task: Task): number {
	if (task.updatedAt > 0) return task.updatedAt;
	let latest = "";
	for (const log of task.logs) {
		if (log.date > latest) latest = log.date;
	}
	if (latest) return Date.parse(`${latest}T00:00:00`);
	if (task.start) return Date.parse(`${task.start}T00:00:00`);
	return 0;
}

function byTimeDesc(a: Task, b: Task): number {
	return sidebarUpdatedAt(b) - sidebarUpdatedAt(a)
		|| a.title.localeCompare(b.title, "zh");
}

/**
 * 合并已保存顺序：未知新任务按时间倒序插到最前；已删除 id 丢弃。
 * saved 为空时返回按时间倒序的全部 id（仅作拖拽快照，不表示已启用手动序）。
 */
export function mergeSidebarOrder(tasksOfType: Task[], saved: string[]): string[] {
	const ids = new Set(tasksOfType.map((t) => t.id));
	const kept = saved.filter((id) => ids.has(id));
	const known = new Set(kept);
	const fresh = [...tasksOfType]
		.filter((t) => !known.has(t.id))
		.sort(byTimeDesc)
		.map((t) => t.id);
	if (!saved.length) return fresh;
	return [...fresh, ...kept];
}

/** 在完整顺序中把 fromId 移到 toId 的位置（插入到 toId 原位）。 */
export function reorderSidebarIds(order: string[], fromId: string, toId: string): string[] {
	if (fromId === toId) return [...order];
	const next = [...order];
	const from = next.indexOf(fromId);
	const to = next.indexOf(toId);
	if (from < 0 || to < 0) return next;
	next.splice(from, 1);
	next.splice(to, 0, fromId);
	return next;
}

/**
 * 侧边栏列表：当前类型 Tab + 状态筛选。
 * orderIds 有值时按手动顺序；否则按最近更新倒序。
 * 不在 order 中的任务按时间倒序排在最前。
 */
export function pickSidebarTasks(
	tasks: Task[],
	type: TaskType,
	statusFilter: SidebarStatusFilter = "all",
	orderIds?: string[],
): Task[] {
	const filtered = tasks.filter((t) =>
		t.type === type
		&& matchSidebarStatus(t.status, statusFilter)
	);
	if (!orderIds?.length) {
		return [...filtered].sort(byTimeDesc);
	}
	const rank = new Map(orderIds.map((id, i) => [id, i]));
	return [...filtered].sort((a, b) => {
		const ai = rank.has(a.id) ? rank.get(a.id)! : -1;
		const bi = rank.has(b.id) ? rank.get(b.id)! : -1;
		// 未入册（-1）的视为「更新」：按时间倒序排在已入册之前，彼此之间再比时间
		if (ai < 0 && bi < 0) return byTimeDesc(a, b);
		if (ai < 0) return -1;
		if (bi < 0) return 1;
		return ai - bi || byTimeDesc(a, b);
	});
}

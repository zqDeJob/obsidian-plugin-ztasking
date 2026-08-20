import type { Task, TaskStatus, TaskType } from "./model.ts";

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

/**
 * 侧边栏列表：当前类型 Tab + 状态筛选，按最近更新倒序，不截断。
 * statusFilter 为 all 时含已完结。
 */
export function pickSidebarTasks(
	tasks: Task[],
	type: TaskType,
	statusFilter: "all" | TaskStatus = "all",
): Task[] {
	return tasks
		.filter((t) =>
			t.type === type
			&& (statusFilter === "all" || t.status === statusFilter)
		)
		.sort((a, b) =>
			sidebarUpdatedAt(b) - sidebarUpdatedAt(a)
			|| a.title.localeCompare(b.title, "zh")
		);
}

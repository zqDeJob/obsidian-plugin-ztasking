import type { Task, TaskType } from "./model.ts";

function sidebarRank(task: Task, today: string): number {
	if (task.status === "doing" && !task.logs.some((l) => l.date === today)) return 1;
	if (task.status === "doing") return 2;
	if (task.status === "todo") return 3;
	return 4;
}

/** 侧边栏列表：按状态优先级排序。选中项只高亮，不插到最前。 */
export function pickSidebarTasks(
	tasks: Task[],
	type: TaskType,
	_selectedId: string,
	today: string,
	limit: number,
): Task[] {
	return tasks
		.filter((t) => t.type === type)
		.sort((a, b) => sidebarRank(a, today) - sidebarRank(b, today) || a.title.localeCompare(b.title, "zh"))
		.slice(0, limit);
}

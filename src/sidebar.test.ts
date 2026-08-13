import assert from "node:assert/strict";
import { test } from "node:test";
import { pickSidebarTasks } from "./sidebar.ts";
import type { Task } from "./model.ts";

const TODAY = "2026-08-13";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
	return {
		path: partial.path ?? partial.id,
		type: "long",
		status: "doing",
		start: "2026-01-01",
		end: "2026-12-31",
		desc: "",
		logs: [],
		...partial,
	};
}

test("点选任务只高亮，不改变侧边栏顺序", () => {
	const tasks = [
		task({ id: "a", title: "A任务", status: "doing" }),
		task({ id: "b", title: "B任务", status: "doing", logs: [{ date: TODAY, text: "x" }] }),
		task({ id: "c", title: "C任务", status: "todo" }),
	];
	const ids = (selectedId: string) =>
		pickSidebarTasks(tasks, "long", selectedId, TODAY, 5).map((t) => t.id);

	assert.deepEqual(ids("a"), ["a", "b", "c"]);
	assert.deepEqual(ids("c"), ["a", "b", "c"]);
	assert.deepEqual(ids("b"), ["a", "b", "c"]);
});

test("仍按需关注 > 进行中 > 未开始 > 已完结，同级按标题", () => {
	const tasks = [
		task({ id: "done", title: "已完", status: "done" }),
		task({ id: "todo", title: "未开", status: "todo" }),
		task({ id: "doing-logged", title: "已记", status: "doing", logs: [{ date: TODAY, text: "x" }] }),
		task({ id: "doing-need", title: "待记", status: "doing" }),
	];
	const ids = pickSidebarTasks(tasks, "long", "done", TODAY, 5).map((t) => t.id);
	assert.deepEqual(ids, ["doing-need", "doing-logged", "todo", "done"]);
});

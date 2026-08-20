import assert from "node:assert/strict";
import { test } from "node:test";
import { pickSidebarTasks } from "./sidebar.ts";
import type { Task } from "./model.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
	return {
		path: partial.path ?? partial.id,
		type: "long",
		status: "doing",
		start: "2026-01-01",
		end: "2026-12-31",
		desc: "",
		logs: [],
		updatedAt: 0,
		...partial,
	};
}

test("点选不影响侧边栏时间倒序", () => {
	const tasks = [
		task({ id: "a", title: "A任务", updatedAt: 300 }),
		task({ id: "b", title: "B任务", updatedAt: 200 }),
		task({ id: "c", title: "C任务", updatedAt: 100 }),
	];
	assert.deepEqual(pickSidebarTasks(tasks, "long", "all").map((t) => t.id), ["a", "b", "c"]);
});

test("全部状态含已完结，按更新时间倒序", () => {
	const tasks = [
		task({ id: "old", title: "较早", updatedAt: 100 }),
		task({ id: "done", title: "已完", status: "done", updatedAt: 999 }),
		task({ id: "mid", title: "中间", updatedAt: 200 }),
		task({ id: "new", title: "最新", updatedAt: 500 }),
	];
	assert.deepEqual(
		pickSidebarTasks(tasks, "long", "all").map((t) => t.id),
		["done", "new", "mid", "old"],
	);
});

test("状态筛选只保留对应状态", () => {
	const tasks = [
		task({ id: "d", title: "完", status: "done", updatedAt: 3 }),
		task({ id: "a", title: "做", status: "doing", updatedAt: 2 }),
		task({ id: "t", title: "未", status: "todo", updatedAt: 1 }),
	];
	assert.deepEqual(pickSidebarTasks(tasks, "long", "doing").map((t) => t.id), ["a"]);
	assert.deepEqual(pickSidebarTasks(tasks, "long", "done").map((t) => t.id), ["d"]);
});

test("只取当前类型 Tab，不截断数量", () => {
	const tasks = Array.from({ length: 8 }, (_, i) =>
		task({ id: `t${i}`, title: `T${i}`, type: "long", updatedAt: i + 1 }),
	);
	tasks.push(task({ id: "x", title: "临时", type: "temp", updatedAt: 99 }));
	const ids = pickSidebarTasks(tasks, "long", "all").map((t) => t.id);
	assert.equal(ids.length, 8);
	assert.deepEqual(ids, ["t7", "t6", "t5", "t4", "t3", "t2", "t1", "t0"]);
});

test("无 mtime 时用最近进展日期倒序", () => {
	const tasks = [
		task({ id: "a", title: "A", logs: [{ date: "2026-08-01", text: "x" }] }),
		task({ id: "b", title: "B", logs: [{ date: "2026-08-10", text: "x" }] }),
		task({ id: "c", title: "C", logs: [{ date: "2026-08-05", text: "x" }] }),
	];
	assert.deepEqual(pickSidebarTasks(tasks, "long", "all").map((t) => t.id), ["b", "c", "a"]);
});

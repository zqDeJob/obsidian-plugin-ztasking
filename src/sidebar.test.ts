import assert from "node:assert/strict";
import { test } from "node:test";
import { matchSidebarStatus, mergeSidebarOrder, pickSidebarTasks, reorderSidebarIds } from "./sidebar.ts";
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

test("状态排除：不包括已完结", () => {
	const tasks = [
		task({ id: "d", title: "完", status: "done", updatedAt: 3 }),
		task({ id: "a", title: "做", status: "doing", updatedAt: 2 }),
		task({ id: "t", title: "未", status: "todo", updatedAt: 1 }),
	];
	assert.deepEqual(pickSidebarTasks(tasks, "long", "!done").map((t) => t.id), ["a", "t"]);
});

test("状态排除：不包括未开始 / 不包括进行中", () => {
	const tasks = [
		task({ id: "d", title: "完", status: "done", updatedAt: 3 }),
		task({ id: "a", title: "做", status: "doing", updatedAt: 2 }),
		task({ id: "t", title: "未", status: "todo", updatedAt: 1 }),
	];
	assert.deepEqual(pickSidebarTasks(tasks, "long", "!todo").map((t) => t.id), ["d", "a"]);
	assert.deepEqual(pickSidebarTasks(tasks, "long", "!doing").map((t) => t.id), ["d", "t"]);
});

test("matchSidebarStatus 识别全部、单状态与排除", () => {
	assert.equal(matchSidebarStatus("done", "all"), true);
	assert.equal(matchSidebarStatus("done", "done"), true);
	assert.equal(matchSidebarStatus("doing", "done"), false);
	assert.equal(matchSidebarStatus("done", "!done"), false);
	assert.equal(matchSidebarStatus("todo", "!done"), true);
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

test("有手动顺序时按 order 排列，忽略时间", () => {
	const tasks = [
		task({ id: "a", title: "A", updatedAt: 300 }),
		task({ id: "b", title: "B", updatedAt: 200 }),
		task({ id: "c", title: "C", updatedAt: 100 }),
	];
	assert.deepEqual(
		pickSidebarTasks(tasks, "long", "all", ["c", "a", "b"]).map((t) => t.id),
		["c", "a", "b"],
	);
});

test("手动顺序下未入册任务按时间倒序排在最前", () => {
	const tasks = [
		task({ id: "a", title: "A", updatedAt: 100 }),
		task({ id: "b", title: "B", updatedAt: 200 }),
		task({ id: "new", title: "新", updatedAt: 999 }),
	];
	assert.deepEqual(
		pickSidebarTasks(tasks, "long", "all", ["a", "b"]).map((t) => t.id),
		["new", "a", "b"],
	);
});

test("mergeSidebarOrder：空 saved 返回时间倒序 id", () => {
	const tasks = [
		task({ id: "a", title: "A", updatedAt: 1 }),
		task({ id: "b", title: "B", updatedAt: 3 }),
		task({ id: "c", title: "C", updatedAt: 2 }),
	];
	assert.deepEqual(mergeSidebarOrder(tasks, []), ["b", "c", "a"]);
});

test("mergeSidebarOrder：新任务插到已保存顺序前面，删掉不存在的 id", () => {
	const tasks = [
		task({ id: "a", title: "A", updatedAt: 1 }),
		task({ id: "b", title: "B", updatedAt: 2 }),
		task({ id: "n", title: "N", updatedAt: 9 }),
	];
	assert.deepEqual(mergeSidebarOrder(tasks, ["gone", "b", "a"]), ["n", "b", "a"]);
});

test("reorderSidebarIds：把 from 挪到 to 的位置", () => {
	assert.deepEqual(reorderSidebarIds(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
	assert.deepEqual(reorderSidebarIds(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
	assert.deepEqual(reorderSidebarIds(["a", "b"], "a", "a"), ["a", "b"]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyCatalogSort,
	applyPinnedFirst,
	nextCatalogSort,
	taskPeriodOverlaps,
	togglePinnedId,
} from "./catalog.ts";
import type { Task } from "./model.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "title" | "type" | "status">): Task {
	return {
		path: `${partial.id}.md`,
		project: "KVAD",
		desc: "",
		start: "2026-01-01",
		end: "2026-12-31",
		logs: [],
		updatedAt: 0,
		...partial,
	};
}

test("taskPeriodOverlaps：周期与区间有交集则命中；单端开放", () => {
	const t = task({ id: "a", title: "a", type: "long", status: "todo", start: "2026-09-01", end: "2026-09-30" });
	assert.equal(taskPeriodOverlaps(t, "2026-09-15", "2026-09-20"), true);
	assert.equal(taskPeriodOverlaps(t, "2026-08-01", "2026-08-31"), false);
	assert.equal(taskPeriodOverlaps(t, "2026-09-30", "2026-10-05"), true);
	assert.equal(taskPeriodOverlaps(t, "2026-09-20", ""), true);
	assert.equal(taskPeriodOverlaps(t, "", "2026-09-01"), true);
	assert.equal(taskPeriodOverlaps(t, "", ""), true);
});

test("nextCatalogSort：同列 none→asc→desc→none；换列重置为 asc", () => {
	assert.deepEqual(nextCatalogSort(null, "type"), { key: "type", dir: "asc" });
	assert.deepEqual(nextCatalogSort({ key: "type", dir: "asc" }, "type"), { key: "type", dir: "desc" });
	assert.deepEqual(nextCatalogSort({ key: "type", dir: "desc" }, "type"), null);
	assert.deepEqual(nextCatalogSort({ key: "type", dir: "asc" }, "status"), { key: "status", dir: "asc" });
});

test("applyCatalogSort：按类型 / 状态 / 工时升降序", () => {
	const tasks = [
		task({ id: "d", title: "d", type: "bug", status: "done", logs: [{ date: "2026-01-01", text: "x", hours: 3 }] }),
		task({ id: "a", title: "a", type: "long", status: "todo", logs: [{ date: "2026-01-01", text: "x", hours: 1 }] }),
		task({ id: "b", title: "b", type: "temp", status: "doing", logs: [{ date: "2026-01-01", text: "x", hours: 2 }] }),
	];
	assert.deepEqual(applyCatalogSort(tasks, { key: "type", dir: "asc" }).map((t) => t.id), ["a", "b", "d"]);
	assert.deepEqual(applyCatalogSort(tasks, { key: "type", dir: "desc" }).map((t) => t.id), ["d", "b", "a"]);
	assert.deepEqual(applyCatalogSort(tasks, { key: "status", dir: "asc" }).map((t) => t.id), ["a", "b", "d"]);
	assert.deepEqual(applyCatalogSort(tasks, { key: "status", dir: "desc" }).map((t) => t.id), ["d", "b", "a"]);
	assert.deepEqual(applyCatalogSort(tasks, { key: "hours", dir: "asc" }).map((t) => t.id), ["a", "b", "d"]);
	assert.deepEqual(applyCatalogSort(tasks, { key: "hours", dir: "desc" }).map((t) => t.id), ["d", "b", "a"]);
	assert.deepEqual(applyCatalogSort(tasks, null).map((t) => t.id), ["d", "a", "b"]);
});

test("nextCatalogSort：工时列可循环", () => {
	assert.deepEqual(nextCatalogSort(null, "hours"), { key: "hours", dir: "asc" });
	assert.deepEqual(nextCatalogSort({ key: "hours", dir: "asc" }, "hours"), { key: "hours", dir: "desc" });
	assert.deepEqual(nextCatalogSort({ key: "hours", dir: "desc" }, "hours"), null);
});

test("applyCatalogSort：按项目名中文序升降", () => {
	const tasks = [
		task({ id: "k", title: "k", type: "long", status: "todo", project: "KVAD" }),
		task({ id: "g", title: "g", type: "long", status: "todo", project: "公共类" }),
		task({ id: "z", title: "z", type: "temp", status: "todo", project: "终端" }),
	];
	assert.deepEqual(applyCatalogSort(tasks, { key: "project", dir: "asc" }).map((t) => t.id), ["g", "z", "k"]);
	assert.deepEqual(applyCatalogSort(tasks, { key: "project", dir: "desc" }).map((t) => t.id), ["k", "z", "g"]);
});

test("nextCatalogSort：项目列可循环", () => {
	assert.deepEqual(nextCatalogSort(null, "project"), { key: "project", dir: "asc" });
	assert.deepEqual(nextCatalogSort({ key: "project", dir: "asc" }, "project"), { key: "project", dir: "desc" });
	assert.deepEqual(nextCatalogSort({ key: "project", dir: "desc" }, "project"), null);
});

test("applyPinnedFirst：置顶优先，其余保持原序；置顶顺序跟 pinnedIds", () => {
	const tasks = [
		task({ id: "a", title: "a", type: "long", status: "todo" }),
		task({ id: "b", title: "b", type: "long", status: "todo" }),
		task({ id: "c", title: "c", type: "temp", status: "todo" }),
	];
	assert.deepEqual(applyPinnedFirst(tasks, []).map((t) => t.id), ["a", "b", "c"]);
	assert.deepEqual(applyPinnedFirst(tasks, ["c", "a"]).map((t) => t.id), ["c", "a", "b"]);
	assert.deepEqual(applyPinnedFirst(tasks, ["gone", "b"]).map((t) => t.id), ["b", "a", "c"]);
});

test("togglePinnedId：置顶插到最前，再点取消", () => {
	assert.deepEqual(togglePinnedId([], "a"), ["a"]);
	assert.deepEqual(togglePinnedId(["b"], "a"), ["a", "b"]);
	assert.deepEqual(togglePinnedId(["a", "b"], "a"), ["b"]);
});

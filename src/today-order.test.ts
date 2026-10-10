import assert from "node:assert/strict";
import test from "node:test";
import { mergeTodayOrder, orderByTodayIds, todayDropAllowed } from "./today-order.ts";

const today = "2026-09-29";

test("mergeTodayOrder：没有保存或日期不是今天时保持原顺序", () => {
	assert.deepEqual(mergeTodayOrder(["a", "b", "c"], undefined, today), ["a", "b", "c"]);
	assert.deepEqual(
		mergeTodayOrder(["a", "b"], { date: "2026-09-28", ids: ["b", "a"] }, today),
		["a", "b"],
	);
	assert.deepEqual(mergeTodayOrder(["a", "b"], { date: today, ids: [] }, today), ["a", "b"]);
});

test("mergeTodayOrder：按已保存顺序，丢掉已不在的条目，新条目接在末尾", () => {
	assert.deepEqual(
		mergeTodayOrder(["a", "b", "c", "d"], { date: today, ids: ["c", "gone", "a"] }, today),
		["c", "a", "b", "d"],
	);
});

test("orderByTodayIds：按 id 重排对象", () => {
	const items = [
		{ id: "a", title: "A" },
		{ id: "b", title: "B" },
	];
	assert.deepEqual(
		orderByTodayIds(items, { date: today, ids: ["b", "a"] }, today),
		[
			{ id: "b", title: "B" },
			{ id: "a", title: "A" },
		],
	);
});

test("todayDropAllowed：未分组可互换，按项目时只能同一项目", () => {
	assert.equal(todayDropAllowed(false, "KVAD", "公共类"), true);
	assert.equal(todayDropAllowed(true, "KVAD", "KVAD"), true);
	assert.equal(todayDropAllowed(true, "KVAD", "公共类"), false);
});

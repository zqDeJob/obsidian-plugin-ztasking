import assert from "node:assert/strict";
import { test } from "node:test";
import { calJumpButtonHtml, calPickerPanelHtml, monthCursorFromDay, shiftMonth } from "./cal-picker.ts";

test("calJumpButtonHtml：自定义按钮含日期与切换动作", () => {
	const html = calJumpButtonHtml("2026-09-24");
	assert.match(html, /ztk-cal-jump-btn/);
	assert.match(html, /data-act="cal-picker-toggle"/);
	assert.match(html, /2026-09-24/);
	assert.doesNotMatch(html, /type="date"/);
});

test("calPickerPanelHtml：月历格子与选中日", () => {
	const html = calPickerPanelHtml({
		cursor: new Date(2026, 8, 1),
		selectedDay: "2026-09-24",
	});
	assert.match(html, /ztk-cal-picker/);
	assert.match(html, /2026 年 9 月/);
	assert.match(html, /data-act="cal-picker-day"/);
	assert.match(html, /data-day="2026-09-24"/);
	assert.match(html, /is-sel/);
	assert.equal((html.match(/data-act="cal-picker-day"/g) || []).length, 42);
});

test("shiftMonth / monthCursorFromDay", () => {
	const cur = monthCursorFromDay("2026-09-24");
	assert.equal(cur.getFullYear(), 2026);
	assert.equal(cur.getMonth(), 8);
	const next = shiftMonth(cur, 1);
	assert.equal(next.getMonth(), 9);
});

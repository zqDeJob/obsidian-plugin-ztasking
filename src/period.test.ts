import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildGanttUnits,
	ganttScaleForDays,
	matchPeriodPreset,
	normalizeDateRange,
	resolvePeriodRange,
} from "./period.ts";

test("快捷周/月/季/年按今天算出范围", () => {
	const today = "2026-08-14";
	const week = resolvePeriodRange("week", today);
	assert.equal(week.label, "本周");
	assert.equal(week.startStr, "2026-08-10");
	assert.equal(week.endStr, "2026-08-16");

	const month = resolvePeriodRange("month", today);
	assert.equal(month.startStr, "2026-08-01");
	assert.equal(month.endStr, "2026-08-31");
});

test("自定范围开始晚于结束时自动对调", () => {
	const r = normalizeDateRange("2026-08-20", "2026-08-01");
	assert.equal(r.startStr, "2026-08-01");
	assert.equal(r.endStr, "2026-08-20");
	assert.equal(r.label, "自定");
});

test("范围能匹配回快捷预设，否则为 custom", () => {
	assert.equal(matchPeriodPreset("2026-08-01", "2026-08-31", "2026-08-14"), "month");
	assert.equal(matchPeriodPreset("2026-07-01", "2026-07-15", "2026-08-14"), "custom");
});

test("甘特刻度：≤31天按天，≤120天按周，更长按月", () => {
	assert.equal(ganttScaleForDays(7), "day");
	assert.equal(ganttScaleForDays(31), "day");
	assert.equal(ganttScaleForDays(32), "week");
	assert.equal(ganttScaleForDays(120), "week");
	assert.equal(ganttScaleForDays(121), "month");
});

test("按天刻度生成起止单元", () => {
	const units = buildGanttUnits("2026-08-01", "2026-08-03", "day");
	assert.equal(units.length, 3);
	assert.equal(units[0]?.label, "1");
	assert.equal(units[2]?.label, "3");
});

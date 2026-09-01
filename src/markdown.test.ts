import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHours, parseHoursInput } from "./model.ts";
import {
	appendTaskLog,
	parseLogHeading,
	parseTaskMarkdown,
	serializeLogHeading,
	serializeTaskMarkdown,
} from "./markdown.ts";

test("parseHoursInput 接受正小数", () => {
	assert.equal(parseHoursInput("1.5"), 1.5);
	assert.equal(parseHoursInput("2h"), 2);
	assert.equal(parseHoursInput("0.25"), 0.25);
});

test("parseHoursInput 拒绝空、零、负数、非数字", () => {
	assert.equal(parseHoursInput(""), null);
	assert.equal(parseHoursInput("0"), null);
	assert.equal(parseHoursInput("-1"), null);
	assert.equal(parseHoursInput("abc"), null);
});

test("formatHours 带 h 后缀", () => {
	assert.equal(formatHours(1.5), "1.5h");
	assert.equal(formatHours(2), "2h");
});

test("parseLogHeading 支持带工时与旧格式", () => {
	assert.deepEqual(parseLogHeading("### [[2026-08-20]] 1.5h"), { date: "2026-08-20", hours: 1.5 });
	assert.deepEqual(parseLogHeading("### [[2026-08-20]]"), { date: "2026-08-20" });
	assert.deepEqual(parseLogHeading("### 2026-08-20 2h"), { date: "2026-08-20", hours: 2 });
});

test("serialize / parse 往返保留工时", () => {
	const md = serializeTaskMarkdown({
		id: "p",
		path: "z-tasking/长期/demo.md",
		title: "demo",
		type: "long",
		status: "doing",
		start: "2026-01-01",
		end: "2026-12-31",
		desc: "说明",
		logs: [{ date: "2026-08-20", text: "- 做了 A", hours: 1.5 }],
		updatedAt: 0,
	});
	assert.match(md, /### \[\[2026-08-20\]\] 1\.5h/);
	const task = parseTaskMarkdown("z-tasking/长期/demo.md", md);
	assert.equal(task.logs[0]?.hours, 1.5);
	assert.equal(task.logs[0]?.text, "- 做了 A");
});

test("serializeLogHeading 无工时时不写 h", () => {
	assert.equal(serializeLogHeading({ date: "2026-08-01", text: "x" }), "### [[2026-08-01]]");
});

test("appendTaskLog 无当日进展时新增一条", () => {
	const next = appendTaskLog(
		[{ date: "2026-08-19", text: "昨天", hours: 1 }],
		"2026-08-20",
		"今天第一笔",
		0.5,
	);
	assert.deepEqual(next, [
		{ date: "2026-08-19", text: "昨天", hours: 1 },
		{ date: "2026-08-20", text: "今天第一笔", hours: 0.5 },
	]);
});

test("appendTaskLog 已有当日进展时追加正文并累加工时", () => {
	const next = appendTaskLog(
		[{ date: "2026-08-20", text: "上午做了 A", hours: 1 }],
		"2026-08-20",
		"下午做了 B",
		0.5,
	);
	assert.equal(next.length, 1);
	assert.equal(next[0]?.date, "2026-08-20");
	assert.equal(next[0]?.text, "上午做了 A\n\n下午做了 B");
	assert.equal(next[0]?.hours, 1.5);
});

test("appendTaskLog 当日正文为空时直接写入新内容", () => {
	const next = appendTaskLog(
		[{ date: "2026-08-20", text: "  ", hours: 1 }],
		"2026-08-20",
		"补记",
		0.25,
	);
	assert.equal(next[0]?.text, "补记");
	assert.equal(next[0]?.hours, 1.25);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHours, parseHoursInput } from "./model.ts";
import {
	appendTaskLog,
	parseLogHeading,
	parseTaskMarkdown,
	relocateTaskLog,
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
		path: "Z-Tasking/长期/demo.md",
		title: "demo",
		project: "KVAD",
		type: "long",
		status: "doing",
		start: "2026-01-01",
		end: "2026-12-31",
		desc: "说明",
		logs: [{ date: "2026-08-20", text: "- 做了 A", hours: 1.5 }],
		updatedAt: 0,
	});
	assert.match(md, /### \[\[2026-08-20\]\] 1\.5h/);
	const task = parseTaskMarkdown("Z-Tasking/长期/demo.md", md);
	assert.equal(task.logs[0]?.hours, 1.5);
	assert.equal(task.logs[0]?.text, "- 做了 A");
	assert.equal(task.project, "KVAD");
	const nested = parseTaskMarkdown("Z-Tasking/KVAD/长期/demo.md", md);
	assert.equal(nested.project, "KVAD");
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

test("relocateTaskLog：同任务改日期，目标日无内容则挪过去", () => {
	const { sourceLogs, targetLogs } = relocateTaskLog(
		[
			{ date: "2026-09-10", text: "记错了", hours: 2 },
			{ date: "2026-09-08", text: "更早", hours: 1 },
		],
		"2026-09-10",
		{ date: "2026-09-09", text: "记错了", hours: 2 },
	);
	assert.equal(sourceLogs, targetLogs);
	assert.deepEqual(
		sourceLogs.map((l) => l.date).sort(),
		["2026-09-08", "2026-09-09"],
	);
	assert.equal(sourceLogs.find((l) => l.date === "2026-09-09")?.hours, 2);
});

test("relocateTaskLog：同任务改日期，目标日已有则合并", () => {
	const { sourceLogs } = relocateTaskLog(
		[
			{ date: "2026-09-10", text: "B", hours: 1 },
			{ date: "2026-09-09", text: "A", hours: 0.5 },
		],
		"2026-09-10",
		{ date: "2026-09-09", text: "B", hours: 1 },
	);
	assert.equal(sourceLogs.length, 1);
	assert.equal(sourceLogs[0]?.date, "2026-09-09");
	assert.equal(sourceLogs[0]?.text, "A\n\nB");
	assert.equal(sourceLogs[0]?.hours, 1.5);
});

test("relocateTaskLog：同任务同日期只更新正文工时", () => {
	const { sourceLogs } = relocateTaskLog(
		[{ date: "2026-09-10", text: "旧", hours: 1 }],
		"2026-09-10",
		{ date: "2026-09-10", text: "新", hours: 2 },
	);
	assert.deepEqual(sourceLogs, [{ date: "2026-09-10", text: "新", hours: 2 }]);
});

test("relocateTaskLog：跨任务移动，目标日无内容", () => {
	const { sourceLogs, targetLogs } = relocateTaskLog(
		[{ date: "2026-09-10", text: "应在 A2", hours: 1.5 }],
		"2026-09-10",
		{ date: "2026-09-10", text: "应在 A2", hours: 1.5 },
		[{ date: "2026-09-01", text: "别的", hours: 1 }],
	);
	assert.equal(sourceLogs.length, 0);
	assert.equal(targetLogs.length, 2);
	assert.equal(targetLogs.find((l) => l.date === "2026-09-10")?.text, "应在 A2");
});

test("relocateTaskLog：跨任务移动，目标日已有则合并", () => {
	const { sourceLogs, targetLogs } = relocateTaskLog(
		[{ date: "2026-09-10", text: "挪过来", hours: 1 }],
		"2026-09-10",
		{ date: "2026-09-10", text: "挪过来", hours: 1 },
		[{ date: "2026-09-10", text: "原有", hours: 2 }],
	);
	assert.equal(sourceLogs.length, 0);
	assert.equal(targetLogs.length, 1);
	assert.equal(targetLogs[0]?.text, "原有\n\n挪过来");
	assert.equal(targetLogs[0]?.hours, 3);
});

test("parseTaskMarkdown 从路径识别缺陷类型", () => {
	const task = parseTaskMarkdown(
		"Z-Tasking/缺陷/某缺陷.md",
		"---\nstatus: todo\nstart: 2026-09-21\nend: 2026-09-30\n---\n\n说明\n",
	);
	assert.equal(task.type, "bug");
	assert.equal(task.title, "某缺陷");
});

test("serialize / parse 缺陷类型往返", () => {
	const md = serializeTaskMarkdown({
		id: "p",
		path: "Z-Tasking/缺陷/某缺陷.md",
		title: "某缺陷",
		project: "KVAD",
		type: "bug",
		status: "doing",
		start: "2026-09-21",
		end: "2026-10-01",
		desc: "修显示",
		logs: [],
		updatedAt: 1,
	});
	assert.match(md, /type: bug/);
	const task = parseTaskMarkdown("Z-Tasking/缺陷/某缺陷.md", md);
	assert.equal(task.type, "bug");
	assert.equal(task.status, "doing");
	assert.equal(task.project, "KVAD");
});

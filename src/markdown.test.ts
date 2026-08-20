import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHours, parseHoursInput } from "./model.ts";
import { parseLogHeading, parseTaskMarkdown, serializeLogHeading, serializeTaskMarkdown } from "./markdown.ts";

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

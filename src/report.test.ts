import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatReportLogsCopyText,
	groupReportLogsByTask,
	hoursBadgeHtml,
	reportLogRowHtml,
	reportLogsHeadHtml,
	reportMergedGroupHtml,
	reportTaskCountRowHtml,
	sumHours,
	todayDigestHtml,
} from "./report.ts";

test("汇总进展行：日期+标题同一行，工时在末尾，正文用 markdown 槽", () => {
	const html = reportLogRowHtml({
		date: "2026-08-13",
		title: "插件开发",
		path: "z-tasking/长期/插件开发.md",
		text: "**加粗** 和 [[笔记]]",
		hours: 1.5,
	});
	assert.match(html, /class="ztk-report-row"/);
	assert.match(
		html,
		/<div class="ztk-report-row-head">\s*<time class="ztk-report-date">2026-08-13<\/time>\s*<strong class="ztk-report-title">插件开发<\/strong>\s*<span class="ztk-hours-badge">1\.5h<\/span>\s*<\/div>/,
	);
	assert.match(html, /class="ztk-md markdown-rendered"/);
	assert.match(html, /data-src="z-tasking\/长期\/插件开发.md"/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.equal(html.includes("**加粗**"), false);
	assert.equal(html.includes("[[笔记]]"), false);
});

test("按任务计数行结构含笔数与工时", () => {
	const html = reportTaskCountRowHtml("插件开发", 2, 3.5);
	assert.match(html, /ztk-count-row/);
	assert.match(html, /插件开发/);
	assert.match(html, /2 笔/);
	assert.match(html, /3\.5h/);
	const noHours = reportTaskCountRowHtml("评审", 1);
	assert.match(noHours, /1 笔/);
	assert.equal(noHours.includes("h</span>"), false);
});

test("我的今天列出今日任务、工时徽章与合计，不含笔数", () => {
	const html = todayDigestHtml("2026-08-13", [
		{ id: "z-tasking/长期/插件开发.md", title: "插件开发", path: "z-tasking/长期/插件开发.md", hours: 1.5 },
		{ id: "z-tasking/临时/评审.md", title: "评审", path: "z-tasking/临时/评审.md", hours: 1 },
	]);
	assert.match(html, /我的今天 · 2026-08-13 · 2\.5h/);
	assert.equal(html.includes("笔"), false);
	assert.match(html, /插件开发/);
	assert.match(html, /ztk-hours-badge/);
	assert.match(html, /1\.5h/);
	assert.match(html, /data-act="goto-task"/);
	assert.match(html, /data-act="copy-md"/);
	assert.match(html, /data-src="z-tasking\/长期\/插件开发.md"/);
	assert.match(html, /data-date="2026-08-13"/);
});

test("我的今天无工时时标题不带小时", () => {
	const html = todayDigestHtml("2026-08-13", [
		{ id: "a.md", title: "旧记录", path: "a.md" },
	]);
	assert.match(html, /我的今天 · 2026-08-13<\/h2>/);
	assert.equal(html.includes("h</h2>"), false);
	assert.equal(html.includes("ztk-hours-badge"), false);
});

test("今天没有记一笔时显示空状态", () => {
	const html = todayDigestHtml("2026-08-13", []);
	assert.match(html, /今天还没有记一笔/);
	assert.equal(html.includes("ztk-md"), false);
});

test("sumHours / hoursBadgeHtml", () => {
	assert.equal(sumHours([{ hours: 1 }, { hours: 0.5 }, {}]), 1.5);
	assert.equal(hoursBadgeHtml(1.5), `<span class="ztk-hours-badge">1.5h</span>`);
	assert.equal(hoursBadgeHtml(0), "");
	assert.equal(hoursBadgeHtml(undefined), "");
});

test("按任务查看：同 path 归为一组，组内日期倒序，组间按最近日期倒序", () => {
	const groups = groupReportLogsByTask([
		{ date: "2026-08-10", title: "评审", path: "z-tasking/临时/评审.md", hours: 1 },
		{ date: "2026-08-13", title: "插件开发", path: "z-tasking/长期/插件开发.md", hours: 1.5 },
		{ date: "2026-08-11", title: "插件开发", path: "z-tasking/长期/插件开发.md", hours: 2 },
		{ date: "2026-08-12", title: "评审", path: "z-tasking/临时/评审.md", hours: 0.5 },
	]);
	assert.equal(groups.length, 2);
	const first = groups[0]!;
	const second = groups[1]!;
	assert.equal(first.title, "插件开发");
	assert.equal(first.path, "z-tasking/长期/插件开发.md");
	assert.equal(first.hours, 3.5);
	assert.equal(first.count, 2);
	assert.deepEqual(first.logs.map((l) => l.date), ["2026-08-13", "2026-08-11"]);
	assert.equal(second.title, "评审");
	assert.deepEqual(second.logs.map((l) => l.date), ["2026-08-12", "2026-08-10"]);
	assert.equal(second.hours, 1.5);
});

test("进展明细表头：按任务在标题后，复制在右侧", () => {
	const off = reportLogsHeadHtml("本周", false);
	assert.match(off, /本周进展明细/);
	assert.match(off, /data-act="toggle-report-by-task"/);
	assert.match(off, /data-act="copy-report-logs"/);
	assert.match(off, />按任务</);
	assert.match(off, />复制</);
	const byTaskIdx = off.indexOf('data-act="toggle-report-by-task"');
	const copyIdx = off.indexOf('data-act="copy-report-logs"');
	const titleIdx = off.indexOf("进展明细");
	assert.ok(titleIdx < byTaskIdx && byTaskIdx < copyIdx);
	assert.equal(/\bon\b/.test(off.match(/data-act="toggle-report-by-task"[^>]*>/)?.[0] ?? ""), false);

	const on = reportLogsHeadHtml("本周", true);
	assert.match(on, /class="[^"]*\bon\b/);
});

test("复制明细：按日期导出标题工时与正文", () => {
	const text = formatReportLogsCopyText([
		{ date: "2026-08-13", title: "插件开发", path: "a.md", text: "修 UI", hours: 1.5 },
		{ date: "2026-08-12", title: "评审", path: "b.md", text: "对一下方案", hours: 1 },
	], false);
	assert.equal(
		text,
		"2026-08-13 插件开发 1.5h\n修 UI\n\n2026-08-12 评审 1h\n对一下方案",
	);
});

test("复制明细：按任务合并导出", () => {
	const text = formatReportLogsCopyText([
		{ date: "2026-08-13", title: "插件开发", path: "a.md", text: "修 UI", hours: 1.5 },
		{ date: "2026-08-11", title: "插件开发", path: "a.md", text: "搭骨架", hours: 2 },
		{ date: "2026-08-12", title: "评审", path: "b.md", text: "对方案", hours: 1 },
	], true);
	assert.equal(
		text,
		"插件开发 · 2 笔 · 3.5h\n2026-08-13 1.5h\n修 UI\n\n2026-08-11 2h\n搭骨架\n\n评审 · 1 笔 · 1h\n2026-08-12 1h\n对方案",
	);
});

test("复制明细：空列表返回空串", () => {
	assert.equal(formatReportLogsCopyText([], false), "");
	assert.equal(formatReportLogsCopyText([], true), "");
});

test("按任务分组 HTML：标题一次，笔数与合计工时，多日期 markdown 槽", () => {
	const html = reportMergedGroupHtml({
		title: "插件开发",
		path: "z-tasking/长期/插件开发.md",
		hours: 3.5,
		count: 2,
		logs: [
			{ date: "2026-08-13", hours: 1.5 },
			{ date: "2026-08-11", hours: 2 },
		],
	});
	assert.match(html, /ztk-report-group/);
	assert.match(html, /插件开发/);
	assert.match(html, /2 笔/);
	assert.match(html, /3\.5h/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.match(html, /data-date="2026-08-11"/);
	assert.match(html, /data-src="z-tasking\/长期\/插件开发.md"/);
	assert.equal((html.match(/ztk-md/g) || []).length, 2);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { hoursBadgeHtml, reportLogRowHtml, reportTaskCountRowHtml, sumHours, todayDigestHtml } from "./report.ts";

test("汇总进展行用 markdown 槽回显，不输出原文", () => {
	const html = reportLogRowHtml({
		date: "2026-08-13",
		title: "插件开发",
		path: "z-tasking/长期/插件开发.md",
		text: "**加粗** 和 [[笔记]]",
		hours: 1.5,
	});
	assert.match(html, /class="ztk-report-row"/);
	assert.match(html, /class="ztk-md markdown-rendered"/);
	assert.match(html, /data-src="z-tasking\/长期\/插件开发.md"/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.match(html, /1\.5h/);
	assert.equal(html.includes("**加粗**"), false);
	assert.equal(html.includes("[[笔记]]"), false);
});

test("按任务计数行结构", () => {
	const html = reportTaskCountRowHtml("插件开发", 2);
	assert.match(html, /ztk-count-row/);
	assert.match(html, /插件开发/);
	assert.match(html, /2 笔/);
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

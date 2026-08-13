import assert from "node:assert/strict";
import { test } from "node:test";
import { reportLogRowHtml, todayDigestHtml } from "./report.ts";

test("汇总「做了什么」用 markdown 槽回显，不输出原文", () => {
	const html = reportLogRowHtml({
		date: "2026-08-13",
		title: "插件开发",
		path: "z-tasking/长期/插件开发.md",
		text: "**加粗** 和 [[笔记]]",
	});
	assert.match(html, /class="ztk-md markdown-rendered"/);
	assert.match(html, /data-src="z-tasking\/长期\/插件开发.md"/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.equal(html.includes("**加粗**"), false);
	assert.equal(html.includes("[[笔记]]"), false);
});

test("我的今天列出今日任务标题和记一笔的 markdown 槽", () => {
	const html = todayDigestHtml("2026-08-13", [
		{ id: "z-tasking/长期/插件开发.md", title: "插件开发", path: "z-tasking/长期/插件开发.md" },
	]);
	assert.match(html, /我的今天/);
	assert.match(html, /插件开发/);
	assert.match(html, /data-act="goto-task"/);
	assert.match(html, /data-src="z-tasking\/长期\/插件开发.md"/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.match(html, /1 笔/);
});

test("今天没有记一笔时显示空状态", () => {
	const html = todayDigestHtml("2026-08-13", []);
	assert.match(html, /今天还没有记一笔/);
	assert.equal(html.includes("ztk-md"), false);
});

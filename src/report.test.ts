import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatReportLogsCopyText,
	groupReportLogsByProject,
	groupReportLogsByTask,
	hoursBadgeHtml,
	reportLogRowHtml,
	reportLogsHeadHtml,
	reportMergedGroupHtml,
	reportTaskCountRowHtml,
	sumHours,
	todayDigestHtml,
} from "./report.ts";

test("汇总进展行：日期+标题同一行，工时在末尾，正文用 markdown 槽，图标打开任务抽屉", () => {
	const html = reportLogRowHtml({
		date: "2026-08-13",
		title: "插件开发",
		path: "Z-Tasking/长期/插件开发.md",
		hours: 1.5,
	});
	assert.match(html, /class="ztk-report-row"/);
	assert.match(html, /data-act="edit-report-log"/);
	assert.equal(html.includes('data-act="copy-md"'), false);
	assert.match(html, /data-path="Z-Tasking\/长期\/插件开发.md"/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.doesNotMatch(html, /<article class="ztk-report-row"[^>]*data-act=/);
	assert.match(
		html,
		/<div class="ztk-report-row-head">\s*<time class="ztk-report-date">2026-08-13<\/time>\s*<strong class="ztk-report-title">插件开发<\/strong>\s*<span class="ztk-hours-badge">1\.5h<\/span>\s*<\/div>/,
	);
	assert.match(html, /class="ztk-md markdown-rendered"/);
	assert.match(html, /data-src="Z-Tasking\/长期\/插件开发.md"/);
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
		{ id: "Z-Tasking/长期/插件开发.md", title: "插件开发", path: "Z-Tasking/长期/插件开发.md", hours: 1.5 },
		{ id: "Z-Tasking/临时/评审.md", title: "评审", path: "Z-Tasking/临时/评审.md", hours: 1 },
	]);
	assert.match(html, /我的今天 · 2026-08-13 · 2\.5h/);
	assert.equal(html.includes("笔"), false);
	assert.match(html, /插件开发/);
	assert.match(html, /ztk-hours-badge/);
	assert.match(html, /1\.5h/);
	assert.match(html, /data-act="goto-task"/);
	assert.match(html, /data-act="del-log"/);
	assert.match(html, /删除今日进展/);
	assert.equal(html.includes('data-act="copy-md"'), false);
	assert.match(html, /data-src="Z-Tasking\/长期\/插件开发.md"/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.doesNotMatch(html, /data-act="toggle-board-section"/);
});

test("我的今天可折叠：工作台传入 collapsible 时显示折叠按钮", () => {
	const open = todayDigestHtml("2026-08-13", [], { collapsible: true });
	assert.match(open, /data-act="toggle-board-section"/);
	assert.match(open, /data-section="today"/);
	assert.match(open, /aria-expanded="true"/);
	assert.doesNotMatch(open, /is-collapsed/);
	const folded = todayDigestHtml("2026-08-13", [], { collapsible: true, collapsed: true });
	assert.match(folded, /is-collapsed/);
	assert.match(folded, /aria-expanded="false"/);
});

test("我的今天无工时时标题不带小时", () => {
	const html = todayDigestHtml("2026-08-13", [
		{ id: "a.md", title: "旧记录", path: "a.md" },
	]);
	assert.match(html, /我的今天 · 2026-08-13<\/h2>/);
	assert.equal(html.includes("h</h2>"), false);
	assert.equal(html.includes("ztk-hours-badge"), false);
});

test("我的今天按项目标记：开关与分组标题", () => {
	const html = todayDigestHtml("2026-09-22", [
		{ id: "a", title: "xxx", path: "Z-Tasking/KVAD/长期/a.md", project: "KVAD", hours: 1 },
		{ id: "b", title: "3000M终端选型", path: "Z-Tasking/公共类/临时/b.md", project: "公共类", hours: 0.5 },
		{ id: "c", title: "另一笔", path: "Z-Tasking/KVAD/临时/c.md", project: "KVAD" },
	], { groupByProject: true });
	assert.match(html, /ztk-today-group-by-project/);
	assert.match(html, /checked/);
	assert.match(html, /【KVAD】/);
	assert.match(html, /【公共类】/);
	assert.match(html, /1、xxx/);
	assert.match(html, /2、另一笔/);
	assert.match(html, /1、3000M终端选型/);
	const kvadIdx = html.indexOf("【KVAD】");
	const pubIdx = html.indexOf("【公共类】");
	// 按中文名排序：公共类 在 KVAD 前
	assert.ok(pubIdx >= 0 && kvadIdx > pubIdx);
});

test("我的今天关闭按项目时无分组标题，仍有开关", () => {
	const html = todayDigestHtml("2026-09-22", [
		{ id: "a", title: "xxx", path: "a.md", project: "KVAD" },
	], { groupByProject: false });
	assert.match(html, /ztk-today-group-by-project/);
	assert.equal(html.includes("checked"), false);
	assert.equal(html.includes("【KVAD】"), false);
	assert.equal(html.includes("1、xxx"), false);
	assert.match(html, />xxx</);
});

test("sumHours / hoursBadgeHtml", () => {
	assert.equal(sumHours([{ hours: 1 }, { hours: 0.5 }, {}]), 1.5);
	assert.equal(hoursBadgeHtml(1.5), `<span class="ztk-hours-badge">1.5h</span>`);
	assert.equal(hoursBadgeHtml(0), "");
	assert.equal(hoursBadgeHtml(undefined), "");
});

test("按任务查看：同 path 归为一组，组内日期倒序，组间按最近日期倒序", () => {
	const groups = groupReportLogsByTask([
		{ date: "2026-08-10", title: "评审", path: "Z-Tasking/临时/评审.md", hours: 1 },
		{ date: "2026-08-13", title: "插件开发", path: "Z-Tasking/长期/插件开发.md", hours: 1.5 },
		{ date: "2026-08-11", title: "插件开发", path: "Z-Tasking/长期/插件开发.md", hours: 2 },
		{ date: "2026-08-12", title: "评审", path: "Z-Tasking/临时/评审.md", hours: 0.5 },
	]);
	assert.equal(groups.length, 2);
	const first = groups[0]!;
	const second = groups[1]!;
	assert.equal(first.title, "插件开发");
	assert.equal(first.path, "Z-Tasking/长期/插件开发.md");
	assert.equal(first.hours, 3.5);
	assert.equal(first.count, 2);
	assert.deepEqual(first.logs.map((l) => l.date), ["2026-08-13", "2026-08-11"]);
	assert.equal(second.title, "评审");
	assert.deepEqual(second.logs.map((l) => l.date), ["2026-08-12", "2026-08-10"]);
	assert.equal(second.hours, 1.5);
});

test("进展明细表头：时间/项目 Tab，搜索在复制左侧", () => {
	const byTime = reportLogsHeadHtml("本周", false, "任务");
	assert.match(byTime, /本周进展明细/);
	assert.match(byTime, /data-act="report-view-mode"/);
	assert.match(byTime, /data-mode="time"/);
	assert.match(byTime, /data-mode="task"/);
	assert.match(byTime, /按时间展示/);
	assert.match(byTime, /按项目展示/);
	assert.match(byTime, /class="ztk-report-search"/);
	assert.match(byTime, /value="任务"/);
	assert.match(byTime, /data-act="copy-report-logs"/);
	assert.match(byTime, />复制</);
	const tabsIdx = byTime.indexOf("ztk-report-view-tabs");
	const searchIdx = byTime.indexOf("ztk-report-search");
	const copyIdx = byTime.indexOf('data-act="copy-report-logs"');
	const titleIdx = byTime.indexOf("进展明细");
	assert.ok(titleIdx < tabsIdx && tabsIdx < searchIdx && searchIdx < copyIdx);
	assert.match(byTime, /class="ztk-report-view-tab on"[^>]*data-mode="time"/);
	assert.match(byTime, /class="ztk-report-view-tab"[^>]*data-mode="task"/);

	const byTask = reportLogsHeadHtml("本周", true);
	assert.match(byTask, /class="ztk-report-view-tab"[^>]*data-mode="time"/);
	assert.match(byTask, /class="ztk-report-view-tab on"[^>]*data-mode="task"/);
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

test("复制明细：按项目合并导出", () => {
	const text = formatReportLogsCopyText([
		{ date: "2026-08-13", title: "插件开发", path: "a.md", project: "KVAD", text: "修 UI", hours: 1.5 },
		{ date: "2026-08-11", title: "插件开发", path: "a.md", project: "KVAD", text: "搭骨架", hours: 2 },
		{ date: "2026-08-12", title: "评审", path: "b.md", project: "终端", text: "对方案", hours: 1 },
		{ date: "2026-08-10", title: "联调", path: "c.md", project: "KVAD", text: "接口", hours: 0.5 },
	], true);
	assert.match(text, /^KVAD · 3 笔 · 4h\n/);
	assert.match(text, /插件开发 · 2 笔 · 3\.5h\n2026-08-13 1\.5h\n修 UI/);
	assert.match(text, /联调 · 1 笔 · 0\.5h\n2026-08-10 0\.5h\n接口/);
	assert.match(text, /终端 · 1 笔 · 1h\n评审 · 1 笔 · 1h\n2026-08-12 1h\n对方案/);
});

test("复制明细：空列表返回空串", () => {
	assert.equal(formatReportLogsCopyText([], false), "");
	assert.equal(formatReportLogsCopyText([], true), "");
});

test("按项目分组 HTML：项目下再按任务合并堆叠", () => {
	const html = reportMergedGroupHtml({
		project: "KVAD",
		hours: 4,
		count: 3,
		logs: [
			{ date: "2026-08-13", title: "插件开发", path: "a.md", hours: 1.5 },
			{ date: "2026-08-11", title: "插件开发", path: "a.md", hours: 2 },
			{ date: "2026-08-10", title: "联调", path: "c.md", hours: 0.5 },
		],
	});
	assert.match(html, /ztk-report-task-card/);
	assert.match(html, /ztk-report-project-tasks/);
	assert.match(html, /ztk-report-task-block/);
	assert.match(html, /ztk-report-entry-card/);
	assert.match(html, /data-act="edit-report-log"/);
	assert.equal(html.includes('data-act="copy-md"'), false);
	assert.match(html, /KVAD/);
	assert.match(html, /3 笔/);
	assert.match(html, /4h/);
	assert.match(html, /插件开发/);
	assert.match(html, /联调/);
	assert.match(html, /2 笔/);
	assert.match(html, /data-date="2026-08-13"/);
	assert.match(html, /data-src="a\.md"/);
	assert.match(html, /data-src="c\.md"/);
	assert.equal((html.match(/class="ztk-report-task-block"/g) || []).length, 2);
	assert.equal((html.match(/class="ztk-report-entry-card"/g) || []).length, 3);
	assert.equal((html.match(/插件开发/g) || []).length, 1);
});

test("groupReportLogsByProject：同项目归并", () => {
	const groups = groupReportLogsByProject([
		{ date: "2026-08-13", title: "插件开发", path: "a.md", project: "KVAD", hours: 1.5 },
		{ date: "2026-08-12", title: "评审", path: "b.md", project: "终端", hours: 1 },
		{ date: "2026-08-10", title: "联调", path: "c.md", project: "KVAD", hours: 0.5 },
	]);
	assert.equal(groups.length, 2);
	assert.equal(groups[0]?.project, "KVAD");
	assert.equal(groups[0]?.count, 2);
	assert.equal(groups[0]?.hours, 2);
	assert.equal(groups[1]?.project, "终端");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assembleDailyReportText,
	buildTodayWorkBody,
	cleanTaskDisplayName,
	coercePlanItem,
	extractIssueId,
	logTextToBullets,
	mergeCodeReviewBullets,
	normalizePlanItems,
	parseMergeRequestRef,
	planItemsToText,
	refreshDailyDraft,
	textToPlanItems,
	tomorrowPlanListHtml,
} from "./daily-report.ts";
import type { Task } from "./model.ts";

test("extractIssueId 识别 YCP 前缀与 # 号", () => {
	assert.equal(extractIssueId("YCPK6-169252 某某需求"), "169252");
	assert.equal(extractIssueId("YCPX2-161794 公共工作"), "161794");
	assert.equal(extractIssueId("杂事 #140087 跟进"), "140087");
	assert.equal(extractIssueId("没有编号的任务"), null);
});

test("cleanTaskDisplayName 去掉单号与下划线", () => {
	assert.equal(cleanTaskDisplayName("YCPK6-169252 _KVAD_REQ_前端"), "KVAD REQ 前端");
});

test("logTextToBullets 去掉工时与加粗", () => {
	assert.deepEqual(
		logTextToBullets("**完成联调** 1.5h\n- 修样式\n\n"),
		["- 完成联调", "- 修样式"],
	);
});

test("buildTodayWorkBody：1～2 条子项收成一行括号", () => {
	const body = buildTodayWorkBody([
		{ title: "YCPK6-170199 V2R010 优化总单-后端支持配置时区-vue", text: "验证" },
		{ title: "YCPK6-169252 需求A", text: "写接口\n联调" },
	]);
	assert.equal(
		body,
		[
			"任务 #170199 V2R010 优化总单-后端支持配置时区-vue （验证）",
			"任务 #169252 需求A （写接口；联调）",
		].join("\n"),
	);
});

test("buildTodayWorkBody：3 条及以上保持多行列表", () => {
	const body = buildTodayWorkBody([
		{ title: "临时杂事", text: "a\nb\nc" },
	]);
	assert.equal(
		body,
		["任务 临时杂事", "- a", "- b", "- c"].join("\n"),
	);
});

test("buildTodayWorkBody 仅工时只写任务行、无子内容", () => {
	const body = buildTodayWorkBody([
		{ title: "联调支持", text: "", hours: 1.5 },
		{ title: "评审", text: "", hours: 1 },
		{ title: "无正文无工时", text: "" },
	]);
	assert.equal(body, ["任务 联调支持", "任务 评审"].join("\n"));
});

test("parseMergeRequestRef 从 URL 拆出项目与单号", () => {
	assert.deepEqual(
		parseMergeRequestRef("代码审核：http://192.168.120.13/module_server/kvad/-/merge_requests/477"),
		{ project: "kvad", iid: 477 },
	);
	assert.deepEqual(
		parseMergeRequestRef("http://192.168.120.13/module_server/kvad/-/merge_requests/481"),
		{ project: "kvad", iid: 481 },
	);
	assert.equal(parseMergeRequestRef("普通进展"), null);
});

test("mergeCodeReviewBullets 同项目 MR 汇总为一行", () => {
	const merged = mergeCodeReviewBullets([
		"- 代码审核：http://192.168.120.13/module_server/kvad/-/merge_requests/477",
		"- http://192.168.120.13/module_server/kvad/-/merge_requests/481",
		"- 代码评审：http://192.168.120.13/module_server/kvad/-/merge_requests/483",
	]);
	assert.deepEqual(merged, ["- 代码审核：MR kvad 477、481、483"]);
});

test("buildTodayWorkBody：代码审核 MR 合并后可收成一行", () => {
	const body = buildTodayWorkBody([{
		title: "代码评审",
		text: [
			"代码审核：http://192.168.120.13/module_server/kvad/-/merge_requests/477",
			"- http://192.168.120.13/module_server/kvad/-/merge_requests/481",
			"- 代码评审：http://192.168.120.13/module_server/kvad/-/merge_requests/483",
		].join("\n"),
	}]);
	assert.equal(body, "任务 代码评审 （代码审核：MR kvad 477、481、483）");
});

test("assembleDailyReportText 紧凑三段且待讨论独立", () => {
	const text = assembleDailyReportText(
		"任务 #161794 公共\n- 做了一件事",
		"明天继续",
		"无",
	);
	assert.equal(
		text,
		[
			"今日工作",
			"任务 #161794 公共",
			"- 做了一件事",
			"明日计划",
			"- 明天继续",
			"待讨论",
			"- 无",
		].join("\n"),
	);
	assert.equal(text.includes("待讨论 无"), false);
});

test("planItems 与文本互转；默认明日计划为空", () => {
	assert.equal(planItemsToText([]), "");
	assert.equal(planItemsToText([{
		id: "1", title: "写单测", project: "无项目", desc: "", notes: [], done: false,
	}]), "- 写单测");
	const items = textToPlanItems("- a\nb\n");
	assert.equal(items.length, 2);
	assert.equal(items[0]?.title, "a");
	assert.equal(items[1]?.title, "b");
	assert.equal(items[0]?.project, "无项目");
});

test("coercePlanItem：兼容旧 { text } 与富结构", () => {
	const legacy = coercePlanItem({ id: "a", text: "旧标题" });
	assert.equal(legacy?.title, "旧标题");
	assert.equal(legacy?.project, "无项目");
	const rich = coercePlanItem({
		id: "b", title: "新", project: "KVAD", desc: "说明", notes: [], done: true,
	});
	assert.equal(rich?.title, "新");
	assert.equal(rich?.project, "KVAD");
	assert.equal(rich?.done, true);
	assert.equal(coercePlanItem({ id: "c" }), null);
});

test("tomorrowPlanListHtml：无勾选，编辑图标 + 底部另起一行新增", () => {
	const html = tomorrowPlanListHtml([
		{ id: "p1", title: "写接口", project: "KVAD", desc: "细节", notes: [], done: false },
	], { selectedId: "p1" });
	assert.match(html, /ztk-yp-task/);
	assert.match(html, /ztk-tp-task/);
	assert.match(html, /data-act="edit-tomorrow-plan"/);
	assert.match(html, /ztk-icon-btn--edit/);
	assert.match(html, /data-plan-id="p1"/);
	assert.match(html, /写接口/);
	assert.match(html, /ztk-project-badge/);
	assert.match(html, /data-act="del-plan-item"/);
	assert.match(html, /ztk-icon-btn--del/);
	assert.match(html, /ztk-plan-add-input/);
	assert.match(html, /data-act="add-plan-item"/);
	assert.doesNotMatch(html, /ztk-yp-check/);
	assert.doesNotMatch(html, /toggle-tomorrow-plan/);
	assert.doesNotMatch(html, /ztk-plan-item-input/);
	assert.match(html, /sel/);
});

test("refreshDailyDraft：换日清空明日计划；未定制保持空", () => {
	const tasks = [{
		id: "a", path: "a.md", title: "A", project: "KVAD", type: "long" as const, status: "doing" as const,
		start: "", end: "", desc: "推进 A", logs: [], updatedAt: 1,
	}] satisfies Task[];
	const draft = refreshDailyDraft(
		{
			date: "2026-09-17",
			work: "旧",
			plan: "- 自定义计划",
			planItems: [{ id: "x", title: "自定义计划", project: "无项目", desc: "", notes: [], done: false }],
			discuss: "- 无",
			workCustom: true,
			planCustom: true,
		},
		"2026-09-18",
		[{ title: "YCPX2-161794 公共", text: "今日项" }],
		tasks,
	);
	assert.equal(draft.date, "2026-09-18");
	assert.equal(draft.workCustom, false);
	assert.equal(draft.planCustom, false);
	assert.match(draft.work, /任务 #161794/);
	assert.equal(draft.plan, "");
	assert.deepEqual(draft.planItems, []);

	const kept = refreshDailyDraft(
		{
			date: "2026-09-18",
			work: "",
			plan: "",
			planItems: [{ id: "legacy", text: "兼容旧字段" } as never],
			discuss: "- 无",
			workCustom: false,
			planCustom: true,
		},
		"2026-09-18",
		[],
		tasks,
	);
	assert.equal(normalizePlanItems(kept)[0]?.title, "兼容旧字段");
});

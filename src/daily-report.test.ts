import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assembleDailyReportText,
	buildTodayWorkBody,
	cleanTaskDisplayName,
	extractIssueId,
	logTextToBullets,
	planItemsToText,
	refreshDailyDraft,
	textToPlanItems,
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

test("buildTodayWorkBody 按约定任务行生成", () => {
	const body = buildTodayWorkBody([
		{ title: "YCPK6-169252 需求A", text: "写接口\n联调" },
		{ title: "临时杂事", text: "回邮件" },
	]);
	assert.equal(
		body,
		["任务 #169252 需求A", "- 写接口", "- 联调", "任务 临时杂事", "- 回邮件"].join("\n"),
	);
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
	assert.equal(planItemsToText([{ id: "1", text: "写单测" }]), "- 写单测");
	const items = textToPlanItems("- a\nb\n");
	assert.equal(items.length, 2);
	assert.equal(items[0]?.text, "a");
	assert.equal(items[1]?.text, "b");
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
			planItems: [{ id: "x", text: "自定义计划" }],
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
});

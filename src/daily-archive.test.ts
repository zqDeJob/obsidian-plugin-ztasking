import assert from "node:assert/strict";
import { test } from "node:test";
import {
	dailyReportNotePath,
	extractTomorrowPlanLines,
	extractYesterdayPlanState,
	isDailyDraftWorthArchiving,
	parseYesterdayPlanQuickLines,
	planReportDateForDay,
	prevDateStr,
	replaceTomorrowPlanSection,
	resolveYpDefaultProject,
	serializeDailyReportNote,
	serializeYesterdayPlanItems,
	withYpNoProjectOption,
	yesterdayPlanBlockHtml,
	yesterdayPlanListHtml,
	type YesterdayPlanItem,
} from "./daily-archive.ts";

function yp(
	title: string,
	desc = "",
	id = "id1",
	project = "无项目",
	notes: YesterdayPlanItem["notes"] = [],
	done = false,
): YesterdayPlanItem {
	return { id, title, project, desc, notes, done };
}

test("dailyReportNotePath 落在根目录/日报/日期.md", () => {
	assert.equal(dailyReportNotePath("Z-Tasking", "2026-09-20"), "Z-Tasking/日报/2026-09-20.md");
	assert.equal(dailyReportNotePath("Z-Tasking/", "2026-09-20"), "Z-Tasking/日报/2026-09-20.md");
});

test("prevDateStr 取前一天", () => {
	assert.equal(prevDateStr("2026-09-21"), "2026-09-20");
	assert.equal(prevDateStr("2026-03-01"), "2026-02-28");
});

test("serializeDailyReportNote 写出 frontmatter 与三段", () => {
	const md = serializeDailyReportNote({
		date: "2026-09-20",
		work: "任务 #1 示例\n- 做了 A",
		plan: "- 明天写测试\n- 明天改 UI",
		discuss: "- 无",
	});
	assert.match(md, /^---\ntype: daily-report\ndate: 2026-09-20\n---\n/);
	assert.match(md, /## 今日工作\n任务 #1 示例\n- 做了 A\n/);
	assert.match(md, /## 明日计划\n- 明天写测试\n- 明天改 UI\n/);
	assert.match(md, /## 待讨论\n- 无\n?$/);
});

test("planReportDateForDay：D 的计划存在 D-1 日报里；昨日计划读昨天日报", () => {
	assert.equal(planReportDateForDay("2026-09-20"), "2026-09-19");
	assert.equal(planReportDateForDay("2026-09-20"), prevDateStr("2026-09-20"));
	// 今天=21 → 昨日计划读 20 号日报的明日计划（即计划所属日=21）
	assert.equal(planReportDateForDay("2026-09-21"), "2026-09-20");
	assert.equal(prevDateStr("2026-09-21"), "2026-09-20");
});

test("extractTomorrowPlanLines 只取明日计划段的列表项", () => {
	const md = serializeDailyReportNote({
		date: "2026-09-20",
		work: "- 无关",
		plan: "- 事项甲\n事项乙\n",
		discuss: "- 无",
	});
	assert.deepEqual(extractTomorrowPlanLines(md), ["事项甲", "事项乙"]);
	assert.deepEqual(extractTomorrowPlanLines(""), []);
	assert.deepEqual(extractTomorrowPlanLines("## 今日工作\n- x\n"), []);
});

test("空草稿不值得归档；有计划或工作时才归档", () => {
	assert.equal(
		isDailyDraftWorthArchiving({ work: "", plan: "", planItems: [], discuss: "- 无" }),
		false,
	);
	assert.equal(
		isDailyDraftWorthArchiving({ work: "x", plan: "", planItems: [], discuss: "- 无" }),
		true,
	);
	assert.equal(
		isDailyDraftWorthArchiving({
			work: "",
			plan: "- a",
			planItems: [{ id: "1", title: "a", project: "无项目", desc: "", notes: [], done: false }],
			discuss: "- 无",
		}),
		true,
	);
});

test("yesterdayPlanListHtml：只读模式无勾选、无删除、不可编辑", () => {
	const html = yesterdayPlanListHtml({
		items: [yp("只看", "", "r1", "终端", [], true)],
		readonly: true,
	});
	assert.match(html, /ztk-day-plan/);
	assert.match(html, /只看/);
	assert.match(html, /is-done/);
	assert.doesNotMatch(html, /ztk-yp-check/);
	assert.doesNotMatch(html, /data-act="edit-yesterday-plan"/);
	assert.doesNotMatch(html, /data-act="del-yesterday-plan"/);
	assert.doesNotMatch(html, /data-act="toggle-yesterday-plan"/);
	assert.doesNotMatch(html, /ztk-task-del/);
});

test("yesterdayPlanBlockHtml：标题为昨日计划，不展示日期控件", () => {
	const html = yesterdayPlanBlockHtml({ items: [], planDay: "2026-09-20" });
	assert.match(html, /<h2>昨日计划<\/h2>/);
	assert.doesNotMatch(html, /ztk-yp-plan-day/);
	assert.match(html, /data-yp-report="2026-09-19"/);
});

test("yesterdayPlanBlockHtml：可编辑列表 + 新增/重置/批量新增，无打开、无内联输入", () => {
	const withItems = yesterdayPlanBlockHtml({
		items: [yp("写单测", "补边界", "a", "KVAD"), yp("改 UI", "", "b", "终端")],
	});
	assert.match(withItems, /昨日计划/);
	assert.match(withItems, /写单测/);
	assert.match(withItems, /ztk-yp-task/);
	assert.match(withItems, /ztk-project-badge/);
	assert.match(withItems, />KVAD</);
	assert.match(withItems, />终端</);
	assert.doesNotMatch(withItems, /补边界/);
	assert.doesNotMatch(withItems, /暂无描述/);
	assert.doesNotMatch(withItems, /data-act="add-yesterday-plan"/);
	assert.match(withItems, /data-act="add-yp-plan-item"/);
	assert.match(withItems, /ztk-plan-add-input/);
	assert.match(withItems, /data-act="reset-yesterday-plan"/);
	assert.match(withItems, /data-act="edit-yesterday-plan"/);
	assert.match(withItems, /ztk-icon-btn--edit/);
	assert.match(withItems, /data-act="del-yesterday-plan"/);
	assert.match(withItems, /ztk-icon-btn--del/);
	assert.match(withItems, /data-yp-id="a"/);
	assert.match(withItems, /data-act="yp-quick-add"/);
	assert.match(withItems, /ztk-ghost/);
	assert.match(withItems, /data-act="toggle-yesterday-plan"/);
	assert.match(withItems, /ztk-yp-check/);
	assert.match(withItems, /data-act="toggle-board-section"/);
	assert.match(withItems, /data-section="yesterday"/);
	assert.match(withItems, /aria-expanded="true"/);
	assert.doesNotMatch(withItems, /is-collapsed/);
	assert.doesNotMatch(withItems, /ztk-yp-quick-input/);
	assert.doesNotMatch(withItems, /data-act="open-yesterday-plan"/);

	const collapsed = yesterdayPlanBlockHtml({ items: [], collapsed: true });
	assert.match(collapsed, /is-collapsed/);
	assert.match(collapsed, /aria-expanded="false"/);

	const doneItem = yesterdayPlanBlockHtml({
		items: [yp("已完成", "", "d1", "KVAD", [], true)],
	});
	assert.match(doneItem, /is-done/);
	assert.match(doneItem, /checked/);

	const noProject = yesterdayPlanBlockHtml({
		items: [yp("无归属", "", "np1", "无项目")],
	});
	assert.doesNotMatch(noProject, /ztk-project-badge/);
	assert.doesNotMatch(noProject, />无项目</);

	const empty = yesterdayPlanBlockHtml({ items: [] });
	assert.match(empty, /暂无计划/);
	assert.doesNotMatch(empty, /data-act="add-yesterday-plan"/);
	assert.match(empty, /data-act="add-yp-plan-item"/);
	assert.match(empty, /ztk-plan-add-input/);
	assert.match(empty, /data-act="reset-yesterday-plan"/);
	assert.match(empty, /data-act="yp-quick-add"/);
	assert.doesNotMatch(empty, /data-act="open-yesterday-plan"/);
});

test("parseYesterdayPlanQuickLines：按行拆标题，忽略空行", () => {
	assert.deepEqual(parseYesterdayPlanQuickLines("甲\n乙\n\n  丙  \n"), ["甲", "乙", "丙"]);
	assert.deepEqual(parseYesterdayPlanQuickLines("  \n"), []);
});

test("withYpNoProjectOption / resolveYpDefaultProject：无项目置顶且为默认", () => {
	assert.deepEqual(withYpNoProjectOption(["KVAD", "终端", "无项目"]), ["无项目", "KVAD", "终端"]);
	assert.deepEqual(withYpNoProjectOption([]), ["无项目"]);
	assert.equal(resolveYpDefaultProject("all"), "无项目");
	assert.equal(resolveYpDefaultProject("终端"), "终端");
});

test("serialize/extract 昨日计划：标题+项目+描述；兼容旧单行；保留 baseline", () => {
	const items = [yp("写单测", "补边界\n再测一轮", "a", "终端"), yp("改 UI", "", "b")];
	const body = serializeYesterdayPlanItems(items);
	assert.match(body, /- \[ \] \*\*写单测\*\* · 终端 <!--yp:a-->\n {2}补边界\n {2}再测一轮/);
	assert.match(body, /- \[ \] \*\*改 UI\*\* · 无项目 <!--yp:b-->/);

	const md = serializeDailyReportNote({
		date: "2026-09-20",
		work: "- 无关",
		plan: body,
		discuss: "- 无",
	});
	const state = extractYesterdayPlanState(md);
	assert.equal(state.items.length, 2);
	assert.equal(state.items[0]?.id, "a");
	assert.equal(state.items[0]?.title, "写单测");
	assert.equal(state.items[0]?.project, "终端");
	assert.equal(state.items[0]?.desc, "补边界\n再测一轮");
	assert.deepEqual(state.items[0]?.notes, []);
	assert.equal(state.items[0]?.done, false);
	assert.equal(state.items[1]?.id, "b");
	assert.equal(state.items[1]?.title, "改 UI");
	assert.equal(state.items[1]?.project, "无项目");
	assert.equal(state.items[1]?.desc, "");
	assert.equal(state.baseline, null);

	const legacy = extractYesterdayPlanState(
		serializeDailyReportNote({ date: "2026-09-20", work: "", plan: "- 事项甲\n- 事项乙", discuss: "- 无" }),
	);
	assert.deepEqual(
		legacy.items.map((it) => ({ title: it.title, project: it.project, desc: it.desc, notes: it.notes, done: it.done })),
		[
			{ title: "事项甲", project: "无项目", desc: "", notes: [], done: false },
			{ title: "事项乙", project: "无项目", desc: "", notes: [], done: false },
		],
	);
	assert.ok(legacy.items[0]?.id);
	assert.notEqual(legacy.items[0]?.id, legacy.items[1]?.id);
});

test("serialize/extract 昨日计划：稳定 id + 记一笔 notes 往返", () => {
	const items = [
		yp("独立计划", "描述一行", "yp-keep", "终端", [
			{ date: "2026-09-22", text: "第一笔" },
			{ date: "2026-09-23", text: "第二笔\n多行" },
		], true),
	];
	const body = serializeYesterdayPlanItems(items);
	assert.match(body, /- \[x\] \*\*独立计划\*\* · 终端 <!--yp:yp-keep-->/);
	assert.match(body, / {2}- 2026-09-22 \| 第一笔/);
	assert.match(body, / {2}- 2026-09-23 \| 第二笔\\n多行/);

	const md = serializeDailyReportNote({
		date: "2026-09-22",
		work: "",
		plan: body,
		discuss: "- 无",
	});
	const again = extractYesterdayPlanState(md);
	assert.equal(again.items[0]?.id, "yp-keep");
	assert.equal(again.items[0]?.desc, "描述一行");
	assert.equal(again.items[0]?.done, true);
	assert.deepEqual(again.items[0]?.notes, [
		{ date: "2026-09-22", text: "第一笔" },
		{ date: "2026-09-23", text: "第二笔\n多行" },
	]);
});

test("replaceTomorrowPlanSection 只改明日计划段并写入 baseline 注释", () => {
	const md = serializeDailyReportNote({
		date: "2026-09-20",
		work: "保持工作",
		plan: "- 旧计划",
		discuss: "- 讨论保留",
	});
	const baseline = [yp("旧计划", "", "base")];
	const next = [yp("新标题", "新描述", "n1", "公共类项目")];
	const out = replaceTomorrowPlanSection(md, next, baseline);
	assert.match(out, /## 今日工作\n保持工作/);
	assert.match(out, /## 待讨论\n- 讨论保留/);
	assert.match(out, /<!--ztk-yp-baseline[\s\S]*?- \[ \] \*\*旧计划\*\*/);
	assert.match(out, /## 明日计划[\s\S]*?- \[ \] \*\*新标题\*\* · 公共类项目 <!--yp:n1-->\n {2}新描述/);
	const state = extractYesterdayPlanState(out);
	assert.equal(state.items[0]?.title, "新标题");
	assert.equal(state.items[0]?.project, "公共类项目");
	assert.equal(state.baseline?.[0]?.title, "旧计划");
});

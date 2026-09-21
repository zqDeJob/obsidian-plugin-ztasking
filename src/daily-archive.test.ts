import assert from "node:assert/strict";
import { test } from "node:test";
import {
	dailyReportNotePath,
	extractTomorrowPlanLines,
	isDailyDraftWorthArchiving,
	prevDateStr,
	serializeDailyReportNote,
	yesterdayPlanBlockHtml,
} from "./daily-archive.ts";

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
			planItems: [{ id: "1", text: "a" }],
			discuss: "- 无",
		}),
		true,
	);
});

test("yesterdayPlanBlockHtml：有条目可打开；无条目灰字", () => {
	const withItems = yesterdayPlanBlockHtml({
		path: "Z-Tasking/日报/2026-09-20.md",
		items: ["写单测", "改 UI"],
	});
	assert.match(withItems, /昨日计划/);
	assert.match(withItems, /写单测/);
	assert.match(withItems, /data-act="open-yesterday-plan"/);
	assert.match(withItems, /data-path="Z-Tasking\/日报\/2026-09-20\.md"/);

	const empty = yesterdayPlanBlockHtml({ path: null, items: [] });
	assert.match(empty, /暂无昨日计划/);
	assert.doesNotMatch(empty, /data-act="open-yesterday-plan"/);
});

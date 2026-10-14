import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "./model.ts";
import {
	computeProjectActivity,
	noticeSlotHtml,
	projectDetailHtml,
	projectListHtml,
} from "./project-page.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "project" | "status">): Task {
	return {
		path: partial.path ?? `${partial.project}/长期/${partial.id}.md`,
		title: partial.title ?? partial.id,
		type: partial.type ?? "long",
		start: partial.start ?? "",
		end: partial.end ?? "",
		desc: partial.desc ?? "",
		logs: partial.logs ?? [],
		updatedAt: partial.updatedAt ?? 0,
		...partial,
	};
}

test("computeProjectActivity：状态计数与 7/30 天窗口", () => {
	const tasks = [
		task({
			id: "a",
			project: "KVAD",
			status: "todo",
			logs: [
				{ date: "2026-10-14", text: "今天", hours: 1 },
				{ date: "2026-10-08", text: "刚好7天", hours: 0.5 },
				{ date: "2026-10-07", text: "第8天", hours: 2 },
				{ date: "2026-09-14", text: "30天外", hours: 9 },
			],
		}),
		task({
			id: "b",
			project: "KVAD",
			status: "doing",
			logs: [{ date: "2026-09-20", text: "30内", hours: 3 }],
		}),
		task({ id: "c", project: "KVAD", status: "done", logs: [] }),
		task({
			id: "x",
			project: "其他",
			status: "todo",
			logs: [{ date: "2026-10-14", text: "忽略", hours: 100 }],
		}),
	];
	const a = computeProjectActivity(tasks, "KVAD", "2026-10-14");
	assert.equal(a.todo, 1);
	assert.equal(a.doing, 1);
	assert.equal(a.done, 1);
	assert.equal(a.d7Count, 2);
	assert.equal(a.d7Hours, 1.5);
	// 窗口起 09-15：10-14/10-08/10-07/09-20
	assert.equal(a.d30Count, 4);
	assert.equal(a.d30Hours, 6.5);
});

test("projectListHtml：选中态与任务数", () => {
	const html = projectListHtml({
		projects: ["A", "B"],
		selected: "B",
		taskCounts: { A: 2, B: 0 },
	});
	assert.match(html, /data-project="B"[^>]*class="ztk-proj-row on"|class="ztk-proj-row on"[^>]*data-project="B"/);
	assert.match(html, /ztk-proj-row-count">2</);
	assert.match(html, /data-act="add-project"/);
});

test("projectDetailHtml：材料主区与空项目", () => {
	const empty = projectDetailHtml({
		project: "",
		activity: { todo: 0, doing: 0, done: 0, d7Count: 0, d7Hours: 0, d30Count: 0, d30Hours: 0 },
		noticeHtmlSlot: "",
		materials: [],
		tasks: [],
	});
	assert.match(empty, /选择或新建/);

	const html = projectDetailHtml({
		project: "KVAD",
		activity: { todo: 1, doing: 0, done: 0, d7Count: 1, d7Hours: 2, d30Count: 1, d30Hours: 2 },
		noticeHtmlSlot: noticeSlotHtml({ exists: false, path: "x" }),
		materials: [
			{ name: "公告.md", path: "Z-Tasking/KVAD/_资料/公告.md" },
			{ name: "片段.md", path: "Z-Tasking/KVAD/_资料/片段.md" },
		],
		tasks: [{ id: "t1", title: "任务甲", status: "todo", type: "long" }],
	});
	assert.match(html, /class="ztk-proj-materials"/);
	assert.match(html, /片段/);
	assert.doesNotMatch(html, /ztk-proj-mat-open[^>]*>公告</);
	assert.match(html, /创建公告/);
	assert.match(html, /任务甲/);
	assert.match(html, /近7天 1笔·2h/);
});

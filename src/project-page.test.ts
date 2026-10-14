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
		path: partial.path ?? `${partial.project}/main/长期/${partial.id}.md`,
		title: partial.title ?? partial.id,
		branch: partial.branch ?? "main",
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

test("projectListHtml：选中态与任务数、工时；无内联新增", () => {
	const html = projectListHtml({
		projects: ["A", "B"],
		selected: "B",
		taskCounts: { A: 2, B: 0 },
		hoursByProject: { A: 3.5, B: 0 },
	});
	assert.match(html, /class="ztk-proj-row sel"[^>]*data-act="select-project"/);
	assert.match(html, /ztk-col-count">2</);
	assert.match(html, /ztk-col-hours">3\.5h</);
	assert.match(html, /工时/);
	assert.doesNotMatch(html, /data-act="add-project"/);
	assert.match(html, /ztk-proj-list-head/);
	assert.match(html, /ztk-catalog-body/);
	assert.match(html, /ztk-drag-handle/);
});

test("noticeSlotHtml：有公告时展示历史区与存档按钮", () => {
	const html = noticeSlotHtml({
		exists: true,
		path: "Z-Tasking/KVAD/main/公告.md",
		history: [{ stamp: "2026-10-14_161205", path: "Z-Tasking/KVAD/main/_公告历史/2026-10-14_161205.md", label: "2026-10-14 16:12:05" }],
	});
	assert.match(html, /历史记录/);
	assert.match(html, /data-act="archive-notice"/);
	assert.match(html, /data-act="restore-notice-history"/);
	assert.match(html, /2026-10-14 16:12:05/);
});

test("projectDetailHtml：材料任务左右分栏；材料可删改", () => {
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
		showCreateNotice: true,
		materials: [
			{ name: "公告.md", path: "Z-Tasking/KVAD/_资料/公告.md" },
			{ name: "片段.md", path: "Z-Tasking/KVAD/_资料/片段.md" },
		],
		tasks: [{ id: "t1", title: "任务甲", status: "todo", type: "long", branch: "main" }],
		branches: ["main", "V7"],
		branchSelected: "main",
	});
	assert.match(html, /class="ztk-proj-split"/);
	assert.match(html, /ztk-card ztk-proj-materials/);
	assert.match(html, /ztk-card ztk-proj-tasks/);
	assert.match(html, /ztk-card ztk-proj-notice/);
	assert.match(html, /公告 · main/);
	assert.match(html, /ztk-card ztk-proj-branches/);
	assert.match(html, /data-act="add-branch"/);
	// 公告在分支模块之前
	assert.ok(html.indexOf("ztk-proj-notice") < html.indexOf("ztk-proj-branches"));
	assert.match(html, /data-branch="V7"/);
	assert.doesNotMatch(html, /data-act="rename-branch"/);
	assert.doesNotMatch(html, /data-act="delete-branch"/);
	assert.match(html, /右键可重命名或删除/);
	assert.match(html, /ztk-detail-title/);
	assert.match(html, /片段/);
	assert.match(html, /data-act="move-material"/);
	assert.match(html, /data-act="rename-material"/);
	assert.match(html, /data-act="delete-material"/);
	assert.doesNotMatch(html, /ztk-proj-mat-title">公告</);
	// 创建公告在卡片头右上角，不在空态正文里
	assert.match(html, /ztk-proj-sec-head[\s\S]*data-act="create-notice"/);
	assert.doesNotMatch(html, /ztk-proj-notice-empty[\s\S]*data-act="create-notice"/);
	assert.match(html, /历史记录/);
	assert.match(html, /任务甲/);
	assert.match(html, /近7天 1笔 · 2h/);
	assert.match(html, /ztk-proj-sec-icon/);
});

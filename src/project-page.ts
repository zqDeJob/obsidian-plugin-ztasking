import {
	STATUS_LABEL,
	TYPE_LABEL,
	addDays,
	esc,
	fmt,
	formatHours,
	parseDate,
	type Task,
	type TaskStatus,
	type TaskType,
} from "./model.ts";
import { PROJECT_NOTICE_FILE } from "./project.ts";
import { sumHours } from "./report.ts";
import { iconBtn } from "./icons.ts";

export type ProjectActivity = {
	todo: number;
	doing: number;
	done: number;
	d7Count: number;
	d7Hours: number;
	d30Count: number;
	d30Hours: number;
};

/** 近 n 天含今天：today 往前 (n-1) 天 */
function windowStart(today: string, daysInclusive: number): string {
	return fmt(addDays(parseDate(today), -(daysInclusive - 1)));
}

export function computeProjectActivity(tasks: Task[], project: string, today: string): ProjectActivity {
	const mine = tasks.filter((t) => t.project === project);
	let todo = 0;
	let doing = 0;
	let done = 0;
	const d7Start = windowStart(today, 7);
	const d30Start = windowStart(today, 30);
	const d7Logs: { hours?: number }[] = [];
	const d30Logs: { hours?: number }[] = [];

	for (const t of mine) {
		if (t.status === "todo") todo += 1;
		else if (t.status === "doing") doing += 1;
		else if (t.status === "done") done += 1;
		for (const log of t.logs) {
			if (log.date > today) continue;
			if (log.date >= d30Start) {
				d30Logs.push(log);
				if (log.date >= d7Start) d7Logs.push(log);
			}
		}
	}

	return {
		todo,
		doing,
		done,
		d7Count: d7Logs.length,
		d7Hours: sumHours(d7Logs),
		d30Count: d30Logs.length,
		d30Hours: sumHours(d30Logs),
	};
}

export function projectListHtml(opts: {
	projects: string[];
	selected: string;
	taskCounts: Record<string, number>;
	renameFrom?: string | null;
}): string {
	const rows = opts.projects
		.map((name) => {
			const count = opts.taskCounts[name] ?? 0;
			const on = name === opts.selected ? " on" : "";
			const renaming = opts.renameFrom === name;
			const nameCell = renaming
				? `<input class="ztk-proj-rename-input" type="text" value="${esc(name)}" data-project="${esc(name)}" aria-label="重命名" />
					${iconBtn("rename-project-save", "save", "保存", `data-project="${esc(name)}"`)}
					${iconBtn("rename-project-cancel", "cancel", "取消")}`
				: `<button type="button" class="ztk-proj-row-name" data-act="select-project" data-project="${esc(name)}">${esc(name)}</button>
					<span class="ztk-proj-row-count">${count}</span>
					${iconBtn("rename-project", "edit", "重命名", `data-project="${esc(name)}"`)}
					${iconBtn("delete-project", "del", "删除", `data-project="${esc(name)}"`)}`;
			return `<li class="ztk-proj-row${on}${renaming ? " is-renaming" : ""}" data-project="${esc(name)}" draggable="${renaming ? "false" : "true"}">
				<span class="ztk-proj-row-drag" aria-hidden="true">⋮⋮</span>
				${nameCell}
			</li>`;
		})
		.join("");

	return `<aside class="ztk-proj-list">
		<div class="ztk-proj-list-add">
			<input class="ztk-proj-add-input" type="text" placeholder="新项目名" aria-label="新项目名" />
			<button type="button" class="ztk-btn" data-act="add-project">新增</button>
		</div>
		<ul class="ztk-proj-list-ul">${rows || `<li class="ztk-proj-empty">暂无项目</li>`}</ul>
	</aside>`;
}

function activityBarHtml(a: ProjectActivity): string {
	const d7h = a.d7Hours > 0 ? `·${esc(formatHours(a.d7Hours))}` : "";
	const d30h = a.d30Hours > 0 ? `·${esc(formatHours(a.d30Hours))}` : "";
	return `<div class="ztk-proj-overview">
		<span class="ztk-proj-stat">未开始 ${a.todo}</span>
		<span class="ztk-proj-stat">进行中 ${a.doing}</span>
		<span class="ztk-proj-stat">已完结 ${a.done}</span>
		<span class="ztk-proj-stat ztk-proj-stat--win">近7天 ${a.d7Count}笔${d7h}</span>
		<span class="ztk-proj-stat ztk-proj-stat--win">近30天 ${a.d30Count}笔${d30h}</span>
	</div>`;
}

function materialsHtml(materials: { name: string; path: string }[]): string {
	const noticeName = PROJECT_NOTICE_FILE.replace(/\.md$/i, "");
	const items = materials
		.filter((m) => m.name !== PROJECT_NOTICE_FILE && m.name !== noticeName)
		.map(
			(m) =>
				`<li class="ztk-proj-mat-item" data-path="${esc(m.path)}">
					<button type="button" class="ztk-proj-mat-open" data-act="open-material" data-path="${esc(m.path)}">${esc(m.name.replace(/\.md$/i, ""))}</button>
				</li>`,
		)
		.join("");
	return `<section class="ztk-proj-materials">
		<header class="ztk-proj-sec-head">
			<h3>材料</h3>
			<button type="button" class="ztk-btn" data-act="new-material">新建材料</button>
		</header>
		<ul class="ztk-proj-mat-list">${items || `<li class="ztk-proj-empty">暂无材料，可新建沉淀笔记</li>`}</ul>
	</section>`;
}

function tasksTableHtml(
	tasks: { id: string; title: string; status: TaskStatus; type: TaskType }[],
): string {
	const rows = tasks
		.map(
			(t) =>
				`<tr class="ztk-proj-task-row" data-id="${esc(t.id)}" data-act="open-project-task">
					<td>${esc(t.title)}</td>
					<td>${esc(TYPE_LABEL[t.type])}</td>
					<td>${esc(STATUS_LABEL[t.status])}</td>
				</tr>`,
		)
		.join("");
	return `<section class="ztk-proj-tasks">
		<header class="ztk-proj-sec-head"><h3>任务</h3></header>
		<table class="ztk-proj-task-table">
			<thead><tr><th>标题</th><th>类型</th><th>状态</th></tr></thead>
			<tbody>${rows || `<tr><td colspan="3" class="ztk-proj-empty">暂无任务</td></tr>`}</tbody>
		</table>
	</section>`;
}

export function projectDetailHtml(opts: {
	project: string;
	activity: ProjectActivity;
	noticeHtmlSlot: string;
	materials: { name: string; path: string }[];
	tasks: { id: string; title: string; status: TaskStatus; type: TaskType }[];
}): string {
	if (!opts.project) {
		return `<main class="ztk-proj-detail"><p class="ztk-proj-empty">选择或新建一个项目</p></main>`;
	}
	return `<main class="ztk-proj-detail">
		<header class="ztk-proj-detail-head"><h2>${esc(opts.project)}</h2></header>
		${activityBarHtml(opts.activity)}
		<section class="ztk-proj-notice">
			<header class="ztk-proj-sec-head"><h3>公告</h3></header>
			<div class="ztk-proj-notice-body">${opts.noticeHtmlSlot}</div>
		</section>
		${materialsHtml(opts.materials)}
		${tasksTableHtml(opts.tasks)}
	</main>`;
}

/** 公告空态 / 有文件时的 md 槽 */
export function noticeSlotHtml(opts: { exists: boolean; path: string }): string {
	if (!opts.exists) {
		return `<div class="ztk-proj-notice-empty">
			<p>尚未创建公告</p>
			<button type="button" class="ztk-btn" data-act="create-notice">创建公告</button>
		</div>`;
	}
	return `<div class="ztk-md markdown-rendered" data-src="${esc(opts.path)}" data-kind="notice"></div>`;
}

import {
	STATUS_LABEL,
	addDays,
	esc,
	fmt,
	formatHours,
	parseDate,
	type Task,
	type TaskStatus,
} from "./model.ts";
import { DEFAULT_BRANCH, PROJECT_NOTICE_FILE } from "./project.ts";
import { sumHours } from "./report.ts";
import { iconBtn } from "./icons.ts";

export type NoticeHistoryItem = { stamp: string; path: string; label: string };

export type ProjectActivity = {
	todo: number;
	doing: number;
	done: number;
	d7Count: number;
	d7Hours: number;
	d30Count: number;
	d30Hours: number;
};

/** 材料区标题装饰图标（按种子稳定选取，避免每次重绘跳动） */
const MATERIAL_TITLE_ICONS = ["📜", "📎", "🗂", "📌", "🧭", "🪶", "🗒", "✨"] as const;

export function materialSectionIcon(seed: string): string {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return MATERIAL_TITLE_ICONS[h % MATERIAL_TITLE_ICONS.length] ?? "📜";
}

/** 近 n 天含今天：today 往前 (n-1) 天 */
function windowStart(today: string, daysInclusive: number): string {
	return fmt(addDays(parseDate(today), -(daysInclusive - 1)));
}

export function computeProjectActivity(
	tasks: Task[],
	project: string,
	today: string,
	branchFilter: string = "all",
): ProjectActivity {
	const bq = branchFilter.trim();
	const mine = tasks.filter((t) => {
		if (t.project !== project) return false;
		if (!bq || bq === "all") return true;
		return t.branch === bq;
	});
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
	/** 项目累计工时（小时） */
	hoursByProject?: Record<string, number>;
	renameFrom?: string | null;
}): string {
	const rows = opts.projects
		.map((name) => {
			const count = opts.taskCounts[name] ?? 0;
			const hours = opts.hoursByProject?.[name] ?? 0;
			const hoursLabel = hours > 0 ? esc(formatHours(hours)) : "—";
			const sel = name === opts.selected ? " sel" : "";
			const renaming = opts.renameFrom === name;
			if (renaming) {
				return `<tr class="ztk-proj-row is-renaming${sel}" data-project="${esc(name)}" draggable="false">
					<td class="ztk-col-drag"></td>
					<td colspan="4" class="ztk-proj-rename-cell">
						<input class="ztk-proj-rename-input" type="text" value="${esc(name)}" data-project="${esc(name)}" aria-label="重命名" />
						${iconBtn("rename-project-save", "save", "保存", `data-project="${esc(name)}"`)}
						${iconBtn("rename-project-cancel", "cancel", "取消")}
					</td>
				</tr>`;
			}
			return `<tr class="ztk-proj-row${sel}" data-act="select-project" data-project="${esc(name)}" role="button" tabindex="0" title="点击选中">
				<td class="ztk-col-drag">
					<span class="ztk-drag-handle" draggable="true" title="拖拽排序" aria-label="拖拽排序" role="button" tabindex="-1">⋮⋮</span>
				</td>
				<td class="ztk-catalog-title">
					<div class="ztk-catalog-title-inner">
						<span class="ztk-rail-dot" aria-hidden="true"></span>
						<span class="ztk-proj-row-name">${esc(name)}</span>
					</div>
				</td>
				<td class="ztk-col-count">${count}</td>
				<td class="ztk-col-hours">${hoursLabel}</td>
				<td class="ztk-catalog-actions">
					<button type="button" class="ztk-task-edit" data-act="rename-project" data-project="${esc(name)}" title="重命名">✎</button>
					<button type="button" class="ztk-task-del" data-act="delete-project" data-project="${esc(name)}" title="删除">×</button>
				</td>
			</tr>`;
		})
		.join("");

	return `<aside class="ztk-proj-list">
		<div class="ztk-proj-list-head">
			<div class="ztk-section-title"><h2>项目</h2></div>
			<span class="ztk-catalog-count">${opts.projects.length}</span>
		</div>
		<div class="ztk-catalog-body ztk-proj-list-body">
			<table>
				<thead>
					<tr>
						<th class="ztk-col-drag"></th>
						<th>名称</th>
						<th class="ztk-col-count">任务</th>
						<th class="ztk-col-hours">工时</th>
						<th class="ztk-catalog-actions"></th>
					</tr>
				</thead>
				<tbody>${rows || `<tr><td colspan="5" class="ztk-proj-empty">暂无项目，点右上角新增</td></tr>`}</tbody>
			</table>
		</div>
	</aside>`;
}

function activityBarHtml(a: ProjectActivity): string {
	const d7h = a.d7Hours > 0 ? ` · ${esc(formatHours(a.d7Hours))}` : "";
	const d30h = a.d30Hours > 0 ? ` · ${esc(formatHours(a.d30Hours))}` : "";
	return `<div class="ztk-proj-overview ztk-meta-fields">
		<span class="ztk-proj-stat">未开始 <strong>${a.todo}</strong></span>
		<span class="ztk-proj-stat">进行中 <strong>${a.doing}</strong></span>
		<span class="ztk-proj-stat">已完结 <strong>${a.done}</strong></span>
		<span class="ztk-proj-stat ztk-proj-stat--win">近7天 ${a.d7Count}笔${d7h}</span>
		<span class="ztk-proj-stat ztk-proj-stat--win">近30天 ${a.d30Count}笔${d30h}</span>
	</div>`;
}

function materialsHtml(opts: {
	project: string;
	materials: { name: string; path: string }[];
	/** 置顶材料文件名（含 .md） */
	pinnedNames?: string[];
}): string {
	const noticeName = PROJECT_NOTICE_FILE.replace(/\.md$/i, "");
	const icon = materialSectionIcon(opts.project || "材料");
	const pinned = new Set(opts.pinnedNames ?? []);
	const items = opts.materials
		.filter((m) => m.name !== PROJECT_NOTICE_FILE && m.name !== noticeName)
		.map((m) => {
			const title = m.name.replace(/\.md$/i, "");
			const isPinned = pinned.has(m.name);
			return `<li class="ztk-proj-mat-item${isPinned ? " is-pinned" : ""}" data-path="${esc(m.path)}" data-name="${esc(m.name)}">
				<span class="ztk-drag-handle" draggable="true" title="拖拽排序" aria-label="拖拽排序" role="button" tabindex="-1">⋮⋮</span>
				<span class="ztk-proj-mat-open" data-act="open-material" data-path="${esc(m.path)}" title="${esc(title)}" role="button" tabindex="0">
					<span class="ztk-rail-dot" aria-hidden="true"></span>
					<span class="ztk-proj-mat-icon" aria-hidden="true">${materialSectionIcon(title)}</span>
					<span class="ztk-proj-mat-title">${esc(title)}</span>
				</span>
				<span class="ztk-proj-mat-actions">
					<button type="button" class="ztk-task-pin${isPinned ? " is-on" : ""}" data-act="pin-material" data-path="${esc(m.path)}" data-name="${esc(m.name)}" title="${isPinned ? "取消置顶" : "置顶"}" aria-pressed="${isPinned ? "true" : "false"}">📌</button>
					${iconBtn("move-material", "move", "迁移到其他项目", `data-path="${esc(m.path)}"`)}
					<button type="button" class="ztk-task-edit" data-act="rename-material" data-path="${esc(m.path)}" title="重命名">✎</button>
					<button type="button" class="ztk-task-del" data-act="delete-material" data-path="${esc(m.path)}" title="删除">×</button>
				</span>
			</li>`;
		})
		.join("");
	return `<section class="ztk-card ztk-proj-materials">
		<header class="ztk-proj-sec-head">
			<div class="ztk-section-title">
				<h2><span class="ztk-proj-sec-icon" aria-hidden="true">${icon}</span>材料</h2>
			</div>
			<button type="button" class="ztk-btn" data-act="new-material">新建材料</button>
		</header>
		<ul class="ztk-proj-mat-list">${items || `<li class="ztk-proj-empty">暂无材料，可新建沉淀笔记</li>`}</ul>
	</section>`;
}

function tasksTableHtml(
	tasks: { id: string; title: string; status: TaskStatus }[],
): string {
	const rows = tasks
		.map(
			(t) =>
				`<tr class="ztk-proj-task-row" data-id="${esc(t.id)}" data-act="open-project-task">
					<td class="ztk-catalog-title">
						<div class="ztk-catalog-title-inner">
							<span class="ztk-rail-dot" aria-hidden="true"></span>
							<span class="ztk-proj-task-title">${esc(t.title)}</span>
						</div>
					</td>
					<td class="ztk-col-status">${esc(STATUS_LABEL[t.status])}</td>
				</tr>`,
		)
		.join("");
	return `<section class="ztk-card ztk-proj-tasks">
		<header class="ztk-proj-sec-head">
			<div class="ztk-section-title"><h2>任务</h2></div>
		</header>
		<div class="ztk-catalog-body ztk-proj-task-scroll">
			<table class="ztk-proj-task-table">
				<thead><tr><th>标题</th><th class="ztk-col-status">状态</th></tr></thead>
				<tbody>${rows || `<tr><td colspan="2" class="ztk-proj-empty">暂无任务</td></tr>`}</tbody>
			</table>
		</div>
	</section>`;
}

export function projectBranchesHtml(opts: {
	branches: string[];
	selected: string;
	renameFrom?: string | null;
}): string {
	const allOn = !opts.selected || opts.selected === "all";
	const chips = [
		`<button type="button" class="ztk-proj-branch-chip${allOn ? " on" : ""}" data-act="select-branch" data-branch="all">全部</button>`,
		...opts.branches.map((name) => {
			const on = name === opts.selected ? " on" : "";
			const renaming = opts.renameFrom === name;
			if (renaming) {
				return `<span class="ztk-proj-branch-rename">
					<input class="ztk-proj-branch-rename-input" type="text" value="${esc(name)}" data-branch="${esc(name)}" aria-label="重命名分支" />
					${iconBtn("rename-branch-save", "save", "保存", `data-branch="${esc(name)}"`)}
					${iconBtn("rename-branch-cancel", "cancel", "取消")}
				</span>`;
			}
			return `<button type="button" class="ztk-proj-branch-chip${on}" data-act="select-branch" data-branch="${esc(name)}" title="右键可重命名或删除">${esc(name)}</button>`;
		}),
	].join("");
	return `<section class="ztk-card ztk-proj-branches">
		<header class="ztk-proj-sec-head">
			<div class="ztk-section-title"><h2>分支</h2></div>
			<button type="button" class="ztk-btn" data-act="add-branch">新建分支</button>
		</header>
		<div class="ztk-proj-branch-bar">${chips}</div>
	</section>`;
}

export function projectDetailHtml(opts: {
	project: string;
	activity: ProjectActivity;
	noticeHtmlSlot: string;
	/** 尚未有公告且已选具体分支时，在卡片右上角显示「创建公告」 */
	showCreateNotice?: boolean;
	materials: { name: string; path: string }[];
	pinnedMaterialNames?: string[];
	tasks: { id: string; title: string; status: TaskStatus }[];
	branches?: string[];
	branchSelected?: string;
	branchRenameFrom?: string | null;
}): string {
	if (!opts.project) {
		return `<main class="ztk-proj-detail"><p class="ztk-empty">选择或新建一个项目</p></main>`;
	}
	const branches = opts.branches ?? [DEFAULT_BRANCH];
	const branchSelected = opts.branchSelected ?? "all";
	const showNotice = branchSelected !== "all";
	const noticeTitle = showNotice ? `公告 · ${branchSelected}` : "公告";
	const noticeHeadAction = opts.showCreateNotice
		? `<button type="button" class="ztk-btn" data-act="create-notice">创建公告</button>`
		: "";
	const noticeCard = showNotice
		? `<section class="ztk-card ztk-proj-notice">
			<header class="ztk-proj-sec-head">
				<div class="ztk-section-title"><h2>${esc(noticeTitle)}</h2></div>
				${noticeHeadAction}
			</header>
			<div class="ztk-proj-notice-body">${opts.noticeHtmlSlot}</div>
		</section>`
		: "";
	return `<main class="ztk-proj-detail">
		<header class="ztk-detail-head ztk-proj-detail-head">
			<div class="ztk-title-block"><h1 class="ztk-detail-title">${esc(opts.project)}</h1></div>
			${activityBarHtml(opts.activity)}
		</header>
		${noticeCard}
		${projectBranchesHtml({
			branches,
			selected: branchSelected,
			renameFrom: opts.branchRenameFrom,
		})}
		<div class="ztk-proj-split">
			${materialsHtml({
				project: opts.project,
				materials: opts.materials,
				pinnedNames: opts.pinnedMaterialNames,
			})}
			${tasksTableHtml(opts.tasks)}
		</div>
	</main>`;
}

function noticeHistoryHtml(items: NoticeHistoryItem[]): string {
	if (!items.length) {
		return `<p class="ztk-muted ztk-proj-notice-hist-empty">暂无历史存档；编辑前会自动存档，也可手动「存档当前」</p>`;
	}
	const rows = items
		.map(
			(it) =>
				`<li class="ztk-proj-notice-hist-item" data-path="${esc(it.path)}">
					<button type="button" class="ztk-ghost ztk-proj-notice-hist-open" data-act="open-notice-history" data-path="${esc(it.path)}" title="查看存档">${esc(it.label)}</button>
					<span class="ztk-proj-notice-hist-actions">
						<button type="button" class="ztk-task-edit" data-act="restore-notice-history" data-path="${esc(it.path)}" title="恢复为当前公告">↺</button>
						<button type="button" class="ztk-task-del" data-act="delete-notice-history" data-path="${esc(it.path)}" title="删除存档">×</button>
					</span>
				</li>`,
		)
		.join("");
	return `<ul class="ztk-proj-notice-hist-list">${rows}</ul>`;
}

function noticeHistoryBlock(history: NoticeHistoryItem[]): string {
	return `<details class="ztk-proj-notice-hist"${history.length ? " open" : ""}>
			<summary>历史记录 <span class="ztk-muted">(${history.length})</span></summary>
			${noticeHistoryHtml(history)}
		</details>`;
}

/** 公告空态 / 有文件时的 md 槽；needBranch=true 表示当前为「全部」未选具体分支 */
export function noticeSlotHtml(opts: {
	exists: boolean;
	path: string;
	needBranch?: boolean;
	history?: NoticeHistoryItem[];
}): string {
	if (opts.needBranch) {
		return `<div class="ztk-proj-notice-empty">
			<p class="ztk-muted">请先选择具体分支，查看或编辑该分支公告（材料仍为项目共用）</p>
		</div>`;
	}
	const history = opts.history ?? [];
	if (!opts.exists) {
		return `<div class="ztk-proj-notice-empty">
			<p class="ztk-muted">尚未创建本分支公告</p>
		</div>
		${noticeHistoryBlock(history)}`;
	}
	return `<div class="ztk-proj-notice-current">
			<div class="ztk-md markdown-rendered" data-src="${esc(opts.path)}" data-kind="notice"></div>
			<div class="ztk-proj-notice-toolbar">
				<button type="button" class="ztk-ghost" data-act="edit-notice" data-path="${esc(opts.path)}">编辑</button>
				<button type="button" class="ztk-btn" data-act="archive-notice" data-path="${esc(opts.path)}">存档当前</button>
			</div>
		</div>
		${noticeHistoryBlock(history)}`;
}

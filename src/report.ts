import {
	STATUS_LABEL,
	TYPE_LABEL,
	esc,
	formatHours,
	type TaskStatus,
	type TaskType,
} from "./model.ts";
import { iconBtn, searchFieldHtml } from "./icons.ts";

export type ReportLogItem = {
	date: string;
	title: string;
	path: string;
	project?: string;
	hours?: number;
};

export type ReportLogGroup = {
	title: string;
	path: string;
	project?: string;
	hours: number;
	count: number;
	logs: { date: string; hours?: number }[];
};

export function projectBadgeHtml(project?: string): string {
	if (!project) return "";
	return `<span class="ztk-project-badge">${esc(project)}</span>`;
}

export function mdSlotHtml(path: string, date: string, kind = "log"): string {
	return `<div class="ztk-md markdown-rendered" data-src="${esc(path)}" data-date="${esc(date)}" data-kind="${esc(kind)}"></div>`;
}

export function sumHours(items: { hours?: number }[]): number {
	const total = items.reduce((sum, it) => sum + (it.hours ?? 0), 0);
	return Math.round(total * 1000) / 1000;
}

export function hoursBadgeHtml(hours?: number): string {
	if (hours === undefined || hours <= 0) return "";
	return `<span class="ztk-hours-badge">${esc(formatHours(hours))}</span>`;
}

export function reportLogRowHtml(log: {
	date: string;
	title: string;
	path: string;
	project?: string;
	hours?: number;
	showProject?: boolean;
}): string {
	return `<article class="ztk-report-row" data-path="${esc(log.path)}" data-date="${esc(log.date)}">
		<div class="ztk-report-row-head">
			<time class="ztk-report-date">${esc(log.date)}</time>
			${log.showProject ? projectBadgeHtml(log.project) : ""}
			<strong class="ztk-report-title">${esc(log.title)}</strong>
			${hoursBadgeHtml(log.hours)}
		</div>
		<div class="ztk-report-body">${mdSlotHtml(log.path, log.date)}</div>
		<div class="ztk-log-actions ztk-report-row-actions">
			${iconBtn("edit-report-log", "edit", "编辑", `data-path="${esc(log.path)}" data-date="${esc(log.date)}"`)}
		</div>
	</article>`;
}

/** 同 path 合并为一组；组内日期倒序；组间按最近日期倒序。 */
export function groupReportLogsByTask(logs: ReportLogItem[]): ReportLogGroup[] {
	const map = new Map<string, ReportLogGroup>();
	for (const log of logs) {
		let group = map.get(log.path);
		if (!group) {
			group = { title: log.title, path: log.path, project: log.project, hours: 0, count: 0, logs: [] };
			map.set(log.path, group);
		}
		group.logs.push({ date: log.date, hours: log.hours });
		group.count += 1;
	}
	for (const group of map.values()) {
		group.logs.sort((a, b) => b.date.localeCompare(a.date));
		group.hours = sumHours(group.logs);
	}
	return [...map.values()].sort((a, b) => {
		const aLatest = a.logs[0]?.date ?? "";
		const bLatest = b.logs[0]?.date ?? "";
		return bLatest.localeCompare(aLatest) || a.title.localeCompare(b.title, "zh");
	});
}

/** 纯文本转义并按关键字包 mark；空关键字只转义。大小写不敏感，保留原文大小写。 */
export function highlightPlainText(text: string, query: string): string {
	const q = query.trim();
	if (!q) return esc(text);
	const lower = text.toLowerCase();
	const qLower = q.toLowerCase();
	let out = "";
	let i = 0;
	while (i < text.length) {
		const idx = lower.indexOf(qLower, i);
		if (idx < 0) {
			out += esc(text.slice(i));
			break;
		}
		out += esc(text.slice(i, idx));
		out += `<mark class="ztk-hl">${esc(text.slice(idx, idx + q.length))}</mark>`;
		i = idx + q.length;
	}
	return out;
}

/** 去掉 root 内既有高亮 mark，合并相邻文本节点。 */
export function clearTextHighlights(root: HTMLElement): void {
	root.querySelectorAll("mark.ztk-hl").forEach((mark) => {
		const parent = mark.parentNode;
		if (!parent) return;
		while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
		parent.removeChild(mark);
		parent.normalize();
	});
}

/** 在 DOM 文本节点中高亮关键字（先清旧 mark）。空关键字只清不标。 */
export function highlightElementText(root: HTMLElement, query: string): void {
	clearTextHighlights(root);
	const q = query.trim();
	if (!q) return;
	const qLower = q.toLowerCase();
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) nodes.push(node as Text);
	for (const textNode of nodes) {
		const text = textNode.nodeValue ?? "";
		if (!text) continue;
		const lower = text.toLowerCase();
		if (!lower.includes(qLower)) continue;
		const frag = document.createDocumentFragment();
		let i = 0;
		while (i < text.length) {
			const idx = lower.indexOf(qLower, i);
			if (idx < 0) {
				frag.appendChild(document.createTextNode(text.slice(i)));
				break;
			}
			if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
			const mark = document.createElement("mark");
			mark.className = "ztk-hl";
			mark.textContent = text.slice(idx, idx + q.length);
			frag.appendChild(mark);
			i = idx + q.length;
		}
		textNode.parentNode?.replaceChild(frag, textNode);
	}
}

/** 同项目合并为一组；组内日期倒序；组间按最近日期倒序。 */
export function groupReportLogsByProject(logs: ReportLogItem[]): ReportProjectGroup[] {
	const map = new Map<string, ReportProjectGroup>();
	for (const log of logs) {
		const project = (log.project ?? "").trim() || "无项目";
		let group = map.get(project);
		if (!group) {
			group = { project, hours: 0, count: 0, logs: [] };
			map.set(project, group);
		}
		group.logs.push({
			date: log.date,
			title: log.title,
			path: log.path,
			hours: log.hours,
		});
		group.count += 1;
	}
	for (const group of map.values()) {
		group.logs.sort((a, b) =>
			b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "zh"),
		);
		group.hours = sumHours(group.logs);
	}
	return [...map.values()].sort((a, b) => {
		const aLatest = a.logs[0]?.date ?? "";
		const bLatest = b.logs[0]?.date ?? "";
		return bLatest.localeCompare(aLatest) || a.project.localeCompare(b.project, "zh");
	});
}

export type ReportProjectGroup = {
	project: string;
	hours: number;
	count: number;
	logs: { date: string; title: string; path: string; hours?: number }[];
};

export function reportLogsHeadHtml(
	label: string,
	byTask: boolean,
	query = "",
	summary?: { count: number; hours: number },
): string {
	const count = summary?.count ?? 0;
	const hours = summary?.hours ?? 0;
	const hoursPart = hours > 0 ? ` · ${esc(formatHours(hours))}` : "";
	const summaryHtml = `<span class="ztk-report-logs-summary">${count} 笔${hoursPart}</span>`;
	return `<div class="ztk-report-logs-head">
		<h2>${esc(label)}进展明细</h2>
		${summaryHtml}
		<div class="ztk-report-view-tabs" role="tablist" aria-label="进展明细视图">
			<button type="button" role="tab" class="ztk-report-view-tab${!byTask ? " on" : ""}" data-act="report-view-mode" data-mode="time" aria-selected="${!byTask}">按时间展示</button>
			<button type="button" role="tab" class="ztk-report-view-tab${byTask ? " on" : ""}" data-act="report-view-mode" data-mode="task" aria-selected="${byTask}">按项目展示</button>
		</div>
		${searchFieldHtml({
			inputClass: "ztk-report-search",
			placeholder: "搜索明细",
			value: query,
			ariaLabel: "搜索进展明细",
		})}
		<button type="button" class="ztk-ghost ztk-report-copy" data-act="copy-report-logs">复制</button>
	</div>`;
}

export type ReportCopyLog = ReportLogItem & { text: string };

function hoursSuffix(hours?: number): string {
	return hours !== undefined && hours > 0 ? ` ${formatHours(hours)}` : "";
}

/** 导出进展明细纯文本，供一键复制；byTask 时按项目→任务聚合。 */
export function formatReportLogsCopyText(logs: ReportCopyLog[], byTask: boolean): string {
	if (!logs.length) return "";
	if (!byTask) {
		return logs.map((l) => {
			const head = `${l.date} ${l.title}${hoursSuffix(l.hours)}`;
			const body = l.text.trim();
			return body ? `${head}\n${body}` : head;
		}).join("\n\n");
	}
	const textByKey = new Map<string, string>();
	for (const log of logs) textByKey.set(`${log.path}::${log.date}`, log.text);
	const projectGroups = groupReportLogsByProject(logs);
	return projectGroups.map((g) => {
		const hours = g.hours > 0 ? ` · ${formatHours(g.hours)}` : "";
		const head = `${g.project} · ${g.count} 笔${hours}`;
		const taskGroups = groupReportLogsByTask(
			g.logs.map((l) => ({ ...l, project: g.project })),
		);
		const tasks = taskGroups.map((tg) => {
			const th = tg.hours > 0 ? ` · ${formatHours(tg.hours)}` : "";
			const taskHead = `${tg.title} · ${tg.count} 笔${th}`;
			const items = tg.logs.map((l) => {
				const line = `${l.date}${hoursSuffix(l.hours)}`;
				const body = (textByKey.get(`${tg.path}::${l.date}`) ?? "").trim();
				return body ? `${line}\n${body}` : line;
			}).join("\n\n");
			return items ? `${taskHead}\n${items}` : taskHead;
		}).join("\n\n");
		return tasks ? `${head}\n${tasks}` : head;
	}).join("\n\n");
}

function reportEntryCardHtml(
	path: string,
	entry: { date: string; hours?: number },
): string {
	return `
		<article class="ztk-report-entry-card" data-path="${esc(path)}" data-date="${esc(entry.date)}">
			<div class="ztk-report-entry-card-head">
				<time class="ztk-report-date">${esc(entry.date)}</time>
				${hoursBadgeHtml(entry.hours)}
			</div>
			<div class="ztk-report-body">${mdSlotHtml(path, entry.date)}</div>
			<div class="ztk-log-actions ztk-report-row-actions">
				${iconBtn("edit-report-log", "edit", "编辑", `data-path="${esc(path)}" data-date="${esc(entry.date)}"`)}
			</div>
		</article>`;
}

export function reportMergedGroupHtml(group: ReportProjectGroup): string {
	const taskGroups = groupReportLogsByTask(
		group.logs.map((l) => ({ ...l, project: group.project })),
	);
	const tasks = taskGroups.map((tg) => {
		const items = tg.logs.map((l) => reportEntryCardHtml(tg.path, l)).join("");
		return `<section class="ztk-report-task-block">
			<header class="ztk-report-task-block-head">
				<strong class="ztk-report-entry-title">${esc(tg.title)}</strong>
				<span class="ztk-report-group-meta">
					<span class="ztk-report-count">${tg.count} 笔</span>
					${hoursBadgeHtml(tg.hours)}
				</span>
			</header>
			<div class="ztk-report-task-card-stack">${items}</div>
		</section>`;
	}).join("");
	const hoursPart = group.hours > 0 ? ` - ${formatHours(group.hours)}` : "";
	const summary = `（${group.count} 笔${hoursPart}）`;
	return `<section class="ztk-report-task-card">
		<header class="ztk-report-task-card-head">
			<strong class="ztk-report-title">${esc(group.project)} <span class="ztk-report-title-meta">${esc(summary)}</span></strong>
		</header>
		<div class="ztk-report-project-tasks">${tasks}</div>
	</section>`;
}

export function reportTaskCountRowHtml(title: string, count: number, hours?: number): string {
	const hoursLabel = hours !== undefined && hours > 0
		? `<span class="ztk-count-hours">${esc(formatHours(hours))}</span>`
		: "";
	return `<div class="ztk-count-row">
		<span class="ztk-count-title">${esc(title)}</span>
		<span class="ztk-count-meta">
			<span class="ztk-count-num">${count} 笔</span>
			${hoursLabel}
		</span>
	</div>`;
}

export type TodayDigestItem = {
	id: string;
	title: string;
	path: string;
	project?: string;
	hours?: number;
};

function todayItemHtml(
	today: string,
	it: TodayDigestItem,
	index?: number,
): string {
	const label = index !== undefined ? `${index}、${it.title}` : it.title;
	return `<div class="ztk-today-item" data-id="${esc(it.id)}" data-path="${esc(it.path)}" data-date="${esc(today)}">
		<div class="ztk-today-head">
			<div class="ztk-today-title">
				<button class="ztk-ghost" data-act="goto-task" data-id="${esc(it.id)}" type="button">${esc(label)}</button>
				${hoursBadgeHtml(it.hours)}
			</div>
			<button type="button" class="ztk-task-del" data-act="del-log" data-id="${esc(it.id)}" data-date="${esc(today)}" title="删除今日进展" aria-label="删除今日进展">×</button>
		</div>
		${mdSlotHtml(it.path, today)}
	</div>`;
}

/** 按项目分组；按中文名排序。 */
export function groupTodayItemsByProject(items: TodayDigestItem[]): { project: string; items: TodayDigestItem[] }[] {
	const map = new Map<string, TodayDigestItem[]>();
	for (const it of items) {
		const project = (it.project ?? "").trim() || "未分组";
		const list = map.get(project) ?? [];
		list.push(it);
		map.set(project, list);
	}
	return [...map.entries()]
		.map(([project, list]) => ({ project, items: list }))
		.sort((a, b) => a.project.localeCompare(b.project, "zh"));
}

export function todayDigestHtml(
	today: string,
	items: TodayDigestItem[],
	opts?: { groupByProject?: boolean; collapsible?: boolean; collapsed?: boolean },
): string {
	const groupByProject = opts?.groupByProject === true;
	const collapsible = opts?.collapsible === true;
	const collapsed = collapsible && opts?.collapsed === true;
	const total = sumHours(items);
	const totalLabel = total > 0 ? ` · ${formatHours(total)}` : "";
	let body: string;
	if (!items.length) {
		body = `<p class="ztk-muted">今天还没有记一笔</p>`;
	} else if (groupByProject) {
		body = groupTodayItemsByProject(items).map((g) => `
			<section class="ztk-today-project">
				<div class="ztk-today-project-label">【${esc(g.project)}】</div>
				${g.items.map((it, i) => todayItemHtml(today, it, i + 1)).join("")}
			</section>`).join("");
	} else {
		body = items.map((it) => todayItemHtml(today, it)).join("");
	}
	const collapseBtn = collapsible
		? `<button type="button" class="ztk-ghost ztk-section-collapse" data-act="toggle-board-section" data-section="today" title="${collapsed ? "展开" : "折叠"}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "展开" : "折叠"}">${collapsed ? "▸" : "▾"}</button>`
		: "";
	return `<div class="ztk-card ztk-today${collapsed ? " is-collapsed" : ""}">
		<div class="ztk-today-bar">
			<div class="ztk-section-title">
				${collapseBtn}
				<h2>我的今天 · ${esc(today)}${esc(totalLabel)}</h2>
			</div>
			<div class="ztk-today-bar-actions">
				<label class="ztk-today-group-toggle" title="按项目标记展示">
					<span class="ztk-today-group-label">按项目</span>
					<span class="ztk-switch">
						<input type="checkbox" class="ztk-today-group-by-project" ${groupByProject ? "checked" : ""} />
						<span class="ztk-switch-track" aria-hidden="true"><span class="ztk-switch-thumb"></span></span>
					</span>
				</label>
			</div>
		</div>
		<div class="ztk-collapsible-body">${body}</div>
	</div>`;
}

export type RecentTaskItem = {
	id: string;
	title: string;
	path: string;
	project?: string;
	type: TaskType;
	status: TaskStatus;
	updatedAt: number;
};

/** 按 updatedAt 倒序取最近编辑任务；updatedAt≤0 排最后。 */
export function pickRecentTasks<T extends { updatedAt: number }>(tasks: T[], limit = 8): T[] {
	const n = Math.max(0, limit);
	return [...tasks]
		.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
		.slice(0, n);
}

/** 相对「现在」的编辑时间文案（纯函数，便于单测）。 */
export function formatRecentEditLabel(updatedAt: number, nowMs: number): string {
	if (!updatedAt || updatedAt <= 0) return "未知";
	const diff = Math.max(0, nowMs - updatedAt);
	const min = Math.floor(diff / 60_000);
	if (min < 1) return "刚刚";
	if (min < 60) return `${min} 分钟前`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour} 小时前`;
	const day = Math.floor(hour / 24);
	if (day === 1) return "昨天";
	if (day < 7) return `${day} 天前`;
	const d = new Date(updatedAt);
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${mm}-${dd}`;
}

/** 汇总顶栏：最近编辑任务卡片。 */
export function recentTasksHtml(
	items: RecentTaskItem[],
	nowMs: number,
	opts?: { showProject?: boolean },
): string {
	const showProject = opts?.showProject !== false;
	const body = items.length
		? `<ul class="ztk-recent-list">
			${items.map((it) => {
				const when = formatRecentEditLabel(it.updatedAt, nowMs);
				const meta = [
					TYPE_LABEL[it.type],
					STATUS_LABEL[it.status],
					showProject && it.project ? it.project : "",
				].filter(Boolean).join(" · ");
				return `<li class="ztk-recent-item is-${esc(it.status)}" data-id="${esc(it.id)}">
					<button type="button" class="ztk-recent-open" data-act="goto-task" data-id="${esc(it.id)}">
						<span class="ztk-recent-row">
							<span class="ztk-recent-title">${esc(it.title)}</span>
							<time class="ztk-recent-when" datetime="${esc(it.updatedAt ? new Date(it.updatedAt).toISOString() : "")}">${esc(when)}</time>
						</span>
						<span class="ztk-recent-meta">${esc(meta)}</span>
					</button>
				</li>`;
			}).join("")}
		</ul>`
		: `<p class="ztk-muted">还没有可显示的任务</p>`;
	return `<div class="ztk-card ztk-recent">
		<div class="ztk-recent-bar">
			<div class="ztk-section-title">
				<h2>最近编辑</h2>
			</div>
		</div>
		${body}
	</div>`;
}

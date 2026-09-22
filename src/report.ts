import { esc, formatHours } from "./model.ts";

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
	text?: string;
	hours?: number;
	showProject?: boolean;
}): string {
	return `<article class="ztk-report-row">
		<div class="ztk-report-row-head">
			<time class="ztk-report-date">${esc(log.date)}</time>
			${log.showProject ? projectBadgeHtml(log.project) : ""}
			<strong class="ztk-report-title">${esc(log.title)}</strong>
			${hoursBadgeHtml(log.hours)}
		</div>
		<div class="ztk-report-body">${mdSlotHtml(log.path, log.date)}</div>
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

export function reportLogsHeadHtml(label: string, byTask: boolean, query = ""): string {
	return `<div class="ztk-report-logs-head">
		<h2>${esc(label)}进展明细</h2>
		<div class="ztk-report-view-tabs" role="tablist" aria-label="进展明细视图">
			<button type="button" role="tab" class="ztk-report-view-tab${!byTask ? " on" : ""}" data-act="report-view-mode" data-mode="time" aria-selected="${!byTask}">按时间展示</button>
			<button type="button" role="tab" class="ztk-report-view-tab${byTask ? " on" : ""}" data-act="report-view-mode" data-mode="task" aria-selected="${byTask}">按任务展示</button>
		</div>
		<input class="ztk-report-search" type="search" placeholder="搜索明细" value="${esc(query)}" aria-label="搜索进展明细" />
		<button type="button" class="ztk-ghost ztk-report-copy" data-act="copy-report-logs">复制</button>
	</div>`;
}

export type ReportCopyLog = ReportLogItem & { text: string };

function hoursSuffix(hours?: number): string {
	return hours !== undefined && hours > 0 ? ` ${formatHours(hours)}` : "";
}

/** 导出进展明细纯文本，供一键复制；byTask 时按任务聚合。 */
export function formatReportLogsCopyText(logs: ReportCopyLog[], byTask: boolean): string {
	if (!logs.length) return "";
	if (!byTask) {
		return logs.map((l) => {
			const head = `${l.date} ${l.title}${hoursSuffix(l.hours)}`;
			const body = l.text.trim();
			return body ? `${head}\n${body}` : head;
		}).join("\n\n");
	}
	const byPath = new Map<string, ReportCopyLog[]>();
	for (const log of logs) {
		const list = byPath.get(log.path) ?? [];
		list.push(log);
		byPath.set(log.path, list);
	}
	const groups = groupReportLogsByTask(logs);
	return groups.map((g) => {
		const hours = g.hours > 0 ? ` · ${formatHours(g.hours)}` : "";
		const head = `${g.title} · ${g.count} 笔${hours}`;
		const items = (byPath.get(g.path) ?? [])
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date))
			.map((l) => {
				const line = `${l.date}${hoursSuffix(l.hours)}`;
				const body = l.text.trim();
				return body ? `${line}\n${body}` : line;
			})
			.join("\n\n");
		return items ? `${head}\n${items}` : head;
	}).join("\n\n");
}

export function reportMergedGroupHtml(group: ReportLogGroup, showProject = false): string {
	const items = group.logs.map((l) => `
		<div class="ztk-report-group-item">
			<div class="ztk-report-row-head">
				<time class="ztk-report-date">${esc(l.date)}</time>
				${hoursBadgeHtml(l.hours)}
			</div>
			<div class="ztk-report-body">${mdSlotHtml(group.path, l.date)}</div>
		</div>`).join("");
	return `<article class="ztk-report-row ztk-report-group">
		<div class="ztk-report-row-head">
			${showProject ? projectBadgeHtml(group.project) : ""}
			<strong class="ztk-report-title">${esc(group.title)}</strong>
			<span class="ztk-report-group-meta">
				<span class="ztk-report-count">${group.count} 笔</span>
				${hoursBadgeHtml(group.hours)}
			</span>
		</div>
		<div class="ztk-report-group-logs">${items}</div>
	</article>`;
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
	return `<div class="ztk-today-item" data-path="${esc(it.path)}" data-date="${esc(today)}">
		<div class="ztk-today-head">
			<div class="ztk-today-title">
				<button class="ztk-ghost" data-act="goto-task" data-id="${esc(it.id)}" type="button">${esc(label)}</button>
				${hoursBadgeHtml(it.hours)}
			</div>
		</div>
		${mdSlotHtml(it.path, today)}
	</div>`;
}

/** 按项目分组；默认项目优先，其余按中文名排序。 */
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
		.sort((a, b) => {
			if (a.project === "KVAD") return -1;
			if (b.project === "KVAD") return 1;
			return a.project.localeCompare(b.project, "zh");
		});
}

export function todayDigestHtml(
	today: string,
	items: TodayDigestItem[],
	opts?: { groupByProject?: boolean },
): string {
	const groupByProject = opts?.groupByProject === true;
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
	return `<div class="ztk-card ztk-today">
		<div class="ztk-today-bar">
			<h2>我的今天 · ${esc(today)}${esc(totalLabel)}</h2>
			<label class="ztk-today-group-toggle" title="按项目标记展示">
				<span class="ztk-today-group-label">按项目</span>
				<span class="ztk-switch">
					<input type="checkbox" class="ztk-today-group-by-project" ${groupByProject ? "checked" : ""} />
					<span class="ztk-switch-track" aria-hidden="true"><span class="ztk-switch-thumb"></span></span>
				</span>
			</label>
		</div>
		${body}
	</div>`;
}

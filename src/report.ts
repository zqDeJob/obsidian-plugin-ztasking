import { esc, formatHours } from "./model.ts";

export type ReportLogItem = {
	date: string;
	title: string;
	path: string;
	hours?: number;
};

export type ReportLogGroup = {
	title: string;
	path: string;
	hours: number;
	count: number;
	logs: { date: string; hours?: number }[];
};

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
	text?: string;
	hours?: number;
}): string {
	return `<article class="ztk-report-row">
		<div class="ztk-report-row-head">
			<time class="ztk-report-date">${esc(log.date)}</time>
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
			group = { title: log.title, path: log.path, hours: 0, count: 0, logs: [] };
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

export function reportLogsHeadHtml(label: string, byTask: boolean): string {
	return `<div class="ztk-report-logs-head">
		<h2>${esc(label)}进展明细</h2>
		<button type="button" class="ztk-ghost ztk-report-by-task${byTask ? " on" : ""}" data-act="toggle-report-by-task">按任务</button>
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

export function reportMergedGroupHtml(group: ReportLogGroup): string {
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

export function todayDigestHtml(
	today: string,
	items: { id: string; title: string; path: string; hours?: number }[],
): string {
	const total = sumHours(items);
	const totalLabel = total > 0 ? ` · ${formatHours(total)}` : "";
	const body = items.length
		? items.map((it) => `<div class="ztk-today-item" data-path="${esc(it.path)}" data-date="${esc(today)}">
			<div class="ztk-today-head">
				<div class="ztk-today-title">
					<button class="ztk-ghost" data-act="goto-task" data-id="${esc(it.id)}" type="button">${esc(it.title)}</button>
					${hoursBadgeHtml(it.hours)}
				</div>
				<button class="ztk-ghost" data-act="copy-md" data-path="${esc(it.path)}" data-date="${esc(today)}" type="button">复制</button>
			</div>
			${mdSlotHtml(it.path, today)}
		</div>`).join("")
		: `<p class="ztk-muted">今天还没有记一笔</p>`;
	return `<div class="ztk-card ztk-today">
		<h2>我的今天 · ${esc(today)}${esc(totalLabel)}</h2>
		${body}
	</div>`;
}

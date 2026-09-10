import { esc, formatHours } from "./model.ts";

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
			${hoursBadgeHtml(log.hours)}
		</div>
		<strong class="ztk-report-title">${esc(log.title)}</strong>
		<div class="ztk-report-body">${mdSlotHtml(log.path, log.date)}</div>
	</article>`;
}

export function reportTaskCountRowHtml(title: string, count: number): string {
	return `<div class="ztk-count-row">
		<span class="ztk-count-title">${esc(title)}</span>
		<span class="ztk-count-num">${count} 笔</span>
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

import { esc } from "./model.ts";

export function mdSlotHtml(path: string, date: string, kind = "log"): string {
	return `<div class="ztk-md markdown-rendered" data-src="${esc(path)}" data-date="${esc(date)}" data-kind="${esc(kind)}"></div>`;
}

export function reportLogRowHtml(log: {
	date: string;
	title: string;
	path: string;
	text?: string;
}): string {
	return `<tr><td>${esc(log.date)}</td><td>${esc(log.title)}</td><td>${mdSlotHtml(log.path, log.date)}</td></tr>`;
}

export function todayDigestHtml(
	today: string,
	items: { id: string; title: string; path: string }[],
): string {
	const body = items.length
		? items.map((it) => `<div class="ztk-today-item">
			<button class="ztk-ghost" data-act="goto-task" data-id="${esc(it.id)}" type="button">${esc(it.title)}</button>
			${mdSlotHtml(it.path, today)}
		</div>`).join("")
		: `<p class="ztk-muted">今天还没有记一笔</p>`;
	return `<div class="ztk-card ztk-today">
		<h2>我的今天 · ${esc(today)} · ${items.length} 笔</h2>
		${body}
	</div>`;
}

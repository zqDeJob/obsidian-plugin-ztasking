import { addDays, esc, fmt, parseDate } from "./model.ts";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/** 日历工具栏：自定义跳转按钮（替代原生 date input） */
export function calJumpButtonHtml(day: string): string {
	return `<button type="button" class="ztk-cal-jump-btn" data-act="cal-picker-toggle" aria-label="选择日期" aria-haspopup="dialog">
		<span class="ztk-cal-jump-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
		</span>
		<span class="ztk-cal-jump-value">${esc(day)}</span>
	</button>`;
}

/** 弹出月历面板 HTML */
export function calPickerPanelHtml(opts: {
	cursor: Date;
	selectedDay: string;
}): string {
	const y = opts.cursor.getFullYear();
	const m = opts.cursor.getMonth();
	const first = new Date(y, m, 1);
	const startOffset = (first.getDay() + 6) % 7;
	const gridStart = addDays(first, -startOffset);
	const today = fmt(new Date());
	const weekHead = WEEKDAYS.map((w) => `<span>${w}</span>`).join("");
	let days = "";
	for (let i = 0; i < 42; i++) {
		const d = addDays(gridStart, i);
		const key = fmt(d);
		const cls = [
			"ztk-cal-picker-day",
			d.getMonth() !== m ? "is-out" : "",
			key === today ? "is-today" : "",
			key === opts.selectedDay ? "is-sel" : "",
		].filter(Boolean).join(" ");
		days += `<button type="button" class="${cls}" data-act="cal-picker-day" data-day="${esc(key)}">${d.getDate()}</button>`;
	}
	return `<div class="ztk-cal-picker" role="dialog" aria-label="选择日期">
		<div class="ztk-cal-picker-head">
			<button type="button" class="ztk-ghost ztk-cal-picker-nav" data-act="cal-picker-prev" title="上一月" aria-label="上一月">‹</button>
			<strong class="ztk-cal-picker-title">${y} 年 ${m + 1} 月</strong>
			<button type="button" class="ztk-ghost ztk-cal-picker-nav" data-act="cal-picker-next" title="下一月" aria-label="下一月">›</button>
		</div>
		<div class="ztk-cal-picker-weekdays">${weekHead}</div>
		<div class="ztk-cal-picker-days">${days}</div>
	</div>`;
}

export function shiftMonth(cursor: Date, delta: number): Date {
	return new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
}

export function monthCursorFromDay(day: string): Date {
	const d = parseDate(day);
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

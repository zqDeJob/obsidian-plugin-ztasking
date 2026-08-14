import { addDays, daysBetween, fmt, parseDate } from "./model.ts";

export type PeriodPreset = "week" | "month" | "quarter" | "year" | "custom";
export type GanttScale = "day" | "week" | "month";

export interface PeriodRange {
	start: Date;
	end: Date;
	startStr: string;
	endStr: string;
	label: string;
	preset: PeriodPreset;
}

export interface GanttUnit {
	start: Date;
	end: Date;
	label: string;
}

export function normalizeDateRange(startStr: string, endStr: string): PeriodRange {
	let start = parseDate(startStr);
	let end = parseDate(endStr);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		const t = parseDate(fmt(new Date()));
		start = t;
		end = t;
	}
	if (start > end) {
		const tmp = start;
		start = end;
		end = tmp;
	}
	return {
		start,
		end,
		startStr: fmt(start),
		endStr: fmt(end),
		label: "自定",
		preset: "custom",
	};
}

export function resolvePeriodRange(preset: Exclude<PeriodPreset, "custom">, todayStr: string): PeriodRange {
	const t = parseDate(todayStr);
	if (preset === "week") {
		const day = (t.getDay() + 6) % 7;
		const start = addDays(t, -day);
		const end = addDays(start, 6);
		return { start, end, startStr: fmt(start), endStr: fmt(end), label: "本周", preset };
	}
	if (preset === "month") {
		const start = new Date(t.getFullYear(), t.getMonth(), 1);
		const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
		return { start, end, startStr: fmt(start), endStr: fmt(end), label: "本月", preset };
	}
	if (preset === "quarter") {
		const q = Math.floor(t.getMonth() / 3) * 3;
		const start = new Date(t.getFullYear(), q, 1);
		const end = new Date(t.getFullYear(), q + 3, 0);
		return { start, end, startStr: fmt(start), endStr: fmt(end), label: "本季", preset };
	}
	const start = new Date(t.getFullYear(), 0, 1);
	const end = new Date(t.getFullYear(), 11, 31);
	return { start, end, startStr: fmt(start), endStr: fmt(end), label: "今年", preset };
}

export function matchPeriodPreset(startStr: string, endStr: string, todayStr: string): PeriodPreset {
	const custom = normalizeDateRange(startStr, endStr);
	for (const p of ["week", "month", "quarter", "year"] as const) {
		const r = resolvePeriodRange(p, todayStr);
		if (r.startStr === custom.startStr && r.endStr === custom.endStr) return p;
	}
	return "custom";
}

export function ganttScaleForDays(days: number): GanttScale {
	if (days <= 31) return "day";
	if (days <= 120) return "week";
	return "month";
}

export function buildGanttUnits(startStr: string, endStr: string, scale: GanttScale): GanttUnit[] {
	const range = normalizeDateRange(startStr, endStr);
	const units: GanttUnit[] = [];
	if (scale === "day") {
		for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) {
			units.push({ start: new Date(d), end: new Date(d), label: String(d.getDate()) });
		}
		return units;
	}
	if (scale === "week") {
		let d = new Date(range.start);
		d = addDays(d, -((d.getDay() + 6) % 7));
		while (d <= range.end) {
			units.push({ start: new Date(d), end: addDays(d, 6), label: `${d.getMonth() + 1}/${d.getDate()}` });
			d = addDays(d, 7);
		}
		return units;
	}
	let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
	while (cursor <= range.end) {
		const start = new Date(cursor);
		const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
		units.push({
			start,
			end,
			label: cursor.getFullYear() === range.start.getFullYear() && cursor.getFullYear() === range.end.getFullYear()
				? `${cursor.getMonth() + 1}月`
				: `${cursor.getFullYear()}/${cursor.getMonth() + 1}`,
		});
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
	}
	return units;
}

export function rangeDayCount(startStr: string, endStr: string): number {
	const r = normalizeDateRange(startStr, endStr);
	return daysBetween(r.start, r.end) + 1;
}

import { addDays, esc, fmt, parseDate, type DailyReportDraftSettings } from "./model.ts";
import { DEFAULT_DAILY_DISCUSS, planItemsToText, type DailyReportDraft } from "./daily-report.ts";

export const DAILY_REPORT_DIR = "日报";

export type DailyArchivePayload = {
	date: string;
	work: string;
	plan: string;
	discuss: string;
};

export function dailyReportNotePath(root: string, date: string): string {
	const r = root.replace(/\/+$/, "");
	return `${r}/${DAILY_REPORT_DIR}/${date}.md`;
}

export function prevDateStr(date: string): string {
	return fmt(addDays(parseDate(date), -1));
}

export function serializeDailyReportNote(payload: DailyArchivePayload): string {
	const work = payload.work.trim();
	const plan = payload.plan.trim();
	const discuss = payload.discuss.trim() || DEFAULT_DAILY_DISCUSS;
	return [
		"---",
		"type: daily-report",
		`date: ${payload.date}`,
		"---",
		"",
		"## 今日工作",
		work,
		"",
		"## 明日计划",
		plan,
		"",
		"## 待讨论",
		discuss,
		"",
	].join("\n");
}

/** 从日报 md 抽出「明日计划」段的条目文本（去掉列表前缀） */
export function extractTomorrowPlanLines(md: string): string[] {
	if (!md.trim()) return [];
	const lines = md.split(/\r?\n/);
	let inPlan = false;
	const items: string[] = [];
	for (const raw of lines) {
		const line = raw.trimEnd();
		if (/^##\s+/.test(line.trim())) {
			const title = line.trim().replace(/^##\s+/, "");
			inPlan = title === "明日计划";
			continue;
		}
		if (!inPlan) continue;
		const t = line.trim();
		if (!t) continue;
		items.push(t.replace(/^[-*•]\s+/, "").trim());
	}
	return items.filter(Boolean);
}

export function isDailyDraftWorthArchiving(
	draft: Pick<DailyReportDraft, "work" | "plan" | "planItems" | "discuss">,
): boolean {
	if (draft.work.trim()) return true;
	if (draft.plan.trim()) return true;
	if (Array.isArray(draft.planItems) && draft.planItems.some((it) => it.text.trim())) return true;
	const discuss = draft.discuss.trim();
	if (discuss && discuss !== DEFAULT_DAILY_DISCUSS) return true;
	return false;
}

export function draftToArchivePayload(draft: DailyReportDraft | DailyReportDraftSettings): DailyArchivePayload {
	const plan = draft.plan?.trim()
		? draft.plan
		: planItemsToText(Array.isArray(draft.planItems) ? draft.planItems : []);
	return {
		date: draft.date,
		work: draft.work ?? "",
		plan,
		discuss: draft.discuss ?? DEFAULT_DAILY_DISCUSS,
	};
}

export function yesterdayPlanBlockHtml(opts: {
	path: string | null;
	items: string[];
}): string {
	const list = opts.items.length
		? `<ul class="ztk-yesterday-plan-list">${opts.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
		: `<p class="ztk-yesterday-plan-empty">暂无昨日计划</p>`;
	const openBtn = opts.path
		? `<button type="button" class="ztk-ghost ztk-yesterday-open" data-act="open-yesterday-plan" data-path="${esc(opts.path)}" title="打开昨日日报">打开</button>`
		: "";
	return `
		<div class="ztk-card ztk-yesterday-plan">
			<div class="ztk-yesterday-plan-head">
				<h2>昨日计划</h2>
				${openBtn}
			</div>
			${list}
		</div>
	`;
}

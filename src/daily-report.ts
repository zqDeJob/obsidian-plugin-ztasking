import { esc, type Task } from "./model.ts";

export type DailyReportSourceLog = {
	title: string;
	text: string;
};

export type TomorrowPlanItem = {
	id: string;
	text: string;
};

export type DailyReportDraft = {
	date: string;
	work: string;
	/** 兼容旧字段：由 planItems 派生 */
	plan: string;
	/** 明日计划待办（工作台 / 汇总共用） */
	planItems: TomorrowPlanItem[];
	discuss: string;
	/** 用户改过「今日工作」后为 true；重置后清零并重新智能填充 */
	workCustom: boolean;
	/** 用户改过「明日计划」后为 true；重置后清空待办 */
	planCustom: boolean;
};

export const DEFAULT_DAILY_DISCUSS = "- 无";

export function newPlanItemId(): string {
	return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 待办 → 日报「明日计划」正文（`- ` 列表） */
export function planItemsToText(items: TomorrowPlanItem[]): string {
	return items
		.map((it) => it.text.trim())
		.filter(Boolean)
		.map((t) => (t.startsWith("- ") ? t : `- ${t.replace(/^[-*•]\s+/, "")}`))
		.join("\n");
}

/** 纯文本 / 旧 plan 字段 → 待办列表 */
export function textToPlanItems(text: string): TomorrowPlanItem[] {
	return text
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => ({
			id: newPlanItemId(),
			text: s.replace(/^[-*•]\s+/, "").trim(),
		}))
		.filter((it) => it.text);
}

/** 规范化草稿中的 planItems，并回写 plan 字符串 */
export function normalizePlanItems(draft: DailyReportDraft): TomorrowPlanItem[] {
	const items = Array.isArray(draft.planItems)
		? draft.planItems
			.map((it) => ({
				id: typeof it?.id === "string" && it.id ? it.id : newPlanItemId(),
				text: typeof it?.text === "string" ? it.text.trim() : "",
			}))
			.filter((it) => it.text)
		: textToPlanItems(draft.plan || "");
	return items;
}

/** 从任务标题提取 ONES 编号（YCPK6-169252 / #161794 等） */
export function extractIssueId(title: string): string | null {
	const tagged = title.match(/\bYCP[A-Z]*\d*-(\d{5,6})\b/i);
	if (tagged?.[1]) return tagged[1];
	const hash = title.match(/#(\d{5,6})\b/);
	if (hash?.[1]) return hash[1];
	return null;
}

/** 去掉单号前缀与多余下划线，得到展示名 */
export function cleanTaskDisplayName(title: string): string {
	const cleaned = title
		.replace(/^\s*YCP[A-Z]*\d*-\d{5,6}\s*/i, "")
		.replace(/#\d{5,6}\b/g, "")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || title.trim();
}

/** 进展正文 → 无工时、无加粗的 `- ` 列表 */
export function logTextToBullets(text: string): string[] {
	const bullets: string[] = [];
	for (const raw of text.split(/\r?\n/)) {
		let line = raw.trim();
		if (!line) continue;
		line = line.replace(/\*\*/g, "");
		line = line.replace(/\b\d+(?:\.\d+)?\s*h\b/gi, "").trim();
		line = line.replace(/^[-*•]\s+/, "").trim();
		if (!line || /^#{1,6}\s/.test(line)) continue;
		bullets.push(`- ${line}`);
	}
	return bullets;
}

/** 按「我的今天」日志智能生成「今日工作」正文（不含 section 标题） */
export function buildTodayWorkBody(logs: DailyReportSourceLog[]): string {
	if (!logs.length) return "";
	const blocks: string[] = [];
	for (const log of logs) {
		const bullets = logTextToBullets(log.text);
		if (!bullets.length) continue;
		const id = extractIssueId(log.title);
		const name = cleanTaskDisplayName(log.title);
		const head = id ? `任务 #${id} ${name}` : `任务 ${name}`;
		blocks.push([head, ...bullets].join("\n"));
	}
	return blocks.join("\n");
}

function ensureBulletBlock(text: string, fallback: string): string {
	const lines = text
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => (s.startsWith("- ") ? s : `- ${s.replace(/^[-*•]\s+/, "")}`));
	return lines.length ? lines.join("\n") : fallback;
}

/**
 * 组装可复制的日报正文（约定格式）：
 * 今日工作 / 任务行 / 明日计划 / 待讨论\\n- 无
 */
export function assembleDailyReportText(work: string, plan: string, discuss: string): string {
	const workBody = work.trim();
	const planBody = plan.trim() ? ensureBulletBlock(plan, "") : "";
	const discussBody = ensureBulletBlock(discuss, DEFAULT_DAILY_DISCUSS);
	const parts = ["今日工作"];
	if (workBody) parts.push(workBody);
	parts.push("明日计划");
	if (planBody) parts.push(planBody);
	parts.push("待讨论", discussBody);
	return parts.join("\n");
}

export function emptyDailyDraft(date: string): DailyReportDraft {
	return {
		date,
		work: "",
		plan: "",
		planItems: [],
		discuss: DEFAULT_DAILY_DISCUSS,
		workCustom: false,
		planCustom: false,
	};
}

/** 按今日日志刷新草稿中未定制的字段；明日计划默认恒为空列表 */
export function refreshDailyDraft(
	draft: DailyReportDraft,
	today: string,
	logs: DailyReportSourceLog[],
	_tasks: Task[],
): DailyReportDraft {
	const next = draft.date === today ? { ...draft } : emptyDailyDraft(today);
	if (next.date !== today) {
		next.date = today;
		next.workCustom = false;
		next.planCustom = false;
		next.planItems = [];
		next.plan = "";
		next.discuss = DEFAULT_DAILY_DISCUSS;
	}
	next.planItems = normalizePlanItems(next);
	if (!next.planCustom) {
		next.planItems = [];
		next.plan = "";
	} else {
		if (!next.planItems.length && next.plan.trim()) {
			next.planItems = textToPlanItems(next.plan);
		}
		next.plan = planItemsToText(next.planItems);
	}
	if (!next.workCustom) next.work = buildTodayWorkBody(logs);
	if (!next.discuss.trim()) next.discuss = DEFAULT_DAILY_DISCUSS;
	return next;
}

/** 明日计划待办列表 HTML（工作台 / 汇总共用） */
export function tomorrowPlanListHtml(items: TomorrowPlanItem[], opts?: { compact?: boolean }): string {
	const list = items.length
		? items.map((it) => `
			<li class="ztk-plan-item" data-plan-id="${esc(it.id)}">
				<input type="text" class="ztk-plan-item-input" data-plan-id="${esc(it.id)}" value="${esc(it.text)}" placeholder="计划内容" />
				<button type="button" class="ztk-plan-item-del" data-act="del-plan-item" data-plan-id="${esc(it.id)}" title="删除" aria-label="删除">×</button>
			</li>`).join("")
		: `<li class="ztk-plan-empty">暂无明日计划，在下方添加</li>`;
	return `
		<ul class="ztk-plan-list${opts?.compact ? " is-compact" : ""}">${list}</ul>
		<div class="ztk-plan-add">
			<input type="text" class="ztk-plan-add-input" placeholder="新建明日计划，回车添加" />
			<button type="button" class="ztk-ghost ztk-plan-add-btn" data-act="add-plan-item">添加</button>
		</div>
	`;
}

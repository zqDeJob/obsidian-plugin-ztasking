import {
	addDays,
	esc,
	fmt,
	parseDate,
	YP_NO_PROJECT,
	type DailyReportDraftSettings,
} from "./model.ts";
import {
	DEFAULT_DAILY_DISCUSS,
	coercePlanItem,
	type DailyReportDraft,
	type TomorrowPlanItem,
} from "./daily-report.ts";
import { iconBtn } from "./icons.ts";
import { projectBadgeHtml } from "./report.ts";

export const DAILY_REPORT_DIR = "日报";

/** @deprecated 使用 model.YP_NO_PROJECT；此处再导出保持旧 import 兼容 */
export { YP_NO_PROJECT };

/** 项目下拉：始终带「无项目」在首项 */
export function withYpNoProjectOption(projects: string[]): string[] {
	const rest = projects
		.map((p) => p.trim())
		.filter((p) => p && p !== YP_NO_PROJECT);
	return [YP_NO_PROJECT, ...rest];
}

/** 昨日计划新建默认项目：有筛选用筛选，否则无项目 */
export function resolveYpDefaultProject(projectFilter: string): string {
	const q = projectFilter.trim();
	if (q && q !== "all") return q;
	return YP_NO_PROJECT;
}

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

/** 某日「计划」写在哪份日报：D 的计划来自 日报/(D-1).md 的「明日计划」段 */
export function planReportDateForDay(planDay: string): string {
	return prevDateStr(planDay);
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

export type YesterdayPlanNote = {
	date: string;
	text: string;
};

export type YesterdayPlanItem = {
	id: string;
	title: string;
	project: string;
	desc: string;
	notes: YesterdayPlanNote[];
	/** 是否已完成（todo 勾选） */
	done: boolean;
};

export type YesterdayPlanState = {
	items: YesterdayPlanItem[];
	/** 文件内冻结的重置基线；无注释时为 null（首次加载用 items 作基线） */
	baseline: YesterdayPlanItem[] | null;
};

const YP_BASELINE_OPEN = "<!--ztk-yp-baseline";
const YP_BASELINE_CLOSE = "<!--ztk-yp-baseline-end-->";
/** 旧版结束符（易与 <!--yp:id--> 冲突，仅兼容读取） */
const YP_BASELINE_CLOSE_LEGACY = "-->";

export function newYesterdayPlanItemId(): string {
	return `yp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 从日报 md 抽出「明日计划」段的条目文本（去掉列表前缀；忽略 baseline 注释与描述续行） */
export function extractTomorrowPlanLines(md: string): string[] {
	return extractYesterdayPlanState(md).items.map((it) => it.title);
}

function stripListPrefix(line: string): string {
	return line.replace(/^[-*•]\s+(?:\[[ xX]\]\s+)?/, "").trim();
}

/** 解析列表项首行：`- [x] **标题** · 项目` / `- **标题**` / `- 纯文本` */
export function parseYesterdayPlanHead(raw: string): { title: string; project: string; done: boolean } {
	const trimmed = raw.trim();
	const cb = trimmed.match(/^[-*•]\s+\[([ xX])\]\s+(.*)$/);
	const done = !!(cb?.[1] && cb[1] !== " ");
	const t = (cb?.[2] ?? stripListPrefix(trimmed)).trim();
	const rich = t.match(/^\*\*(.+?)\*\*(?:\s*[·•@]\s*(.+))?$/);
	if (rich?.[1]) {
		return {
			title: rich[1].trim(),
			project: (rich[2] ?? "").trim() || YP_NO_PROJECT,
			done,
		};
	}
	const tagged = t.match(/^\[(.+?)\]\s*(.+)$/);
	if (tagged?.[1] && tagged[2]) {
		return { title: tagged[2].trim(), project: tagged[1].trim() || YP_NO_PROJECT, done };
	}
	return { title: t, project: YP_NO_PROJECT, done };
}

/** 解析「明日计划」段正文（可含 baseline 注释）→ 条目 + 基线 */
export function parseYesterdayPlanSection(sectionBody: string): YesterdayPlanState {
	if (!sectionBody.trim()) return { items: [], baseline: null };
	let baseline: YesterdayPlanItem[] | null = null;
	let rest = sectionBody;
	const openIdx = rest.indexOf(YP_BASELINE_OPEN);
	if (openIdx >= 0) {
		const afterOpen = rest.slice(openIdx + YP_BASELINE_OPEN.length);
		let closeLen = YP_BASELINE_CLOSE.length;
		let closeIdx = afterOpen.indexOf(YP_BASELINE_CLOSE);
		if (closeIdx < 0) {
			// 兼容旧文件：找「独占一行的 -->」，避免命中 <!--yp:id-->
			const legacy = afterOpen.match(/\n\s*-->\s*(?:\n|$)/);
			if (legacy?.index !== undefined) {
				closeIdx = legacy.index;
				closeLen = legacy[0].length;
			} else {
				closeIdx = afterOpen.indexOf(YP_BASELINE_CLOSE_LEGACY);
				closeLen = YP_BASELINE_CLOSE_LEGACY.length;
			}
		}
		if (closeIdx >= 0) {
			const inner = afterOpen.slice(0, closeIdx).replace(/^\s*\n?/, "").replace(/\n?\s*$/, "");
			baseline = parsePlanItemList(inner);
			rest = (rest.slice(0, openIdx) + afterOpen.slice(closeIdx + closeLen)).trim();
		}
	}
	return { items: parsePlanItemList(rest), baseline };
}

const YP_ID_RE = /<!--yp:([A-Za-z0-9_-]+)-->/;
const YP_NOTE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s*\|\s*(.*)$/;

function escapeYpNoteText(text: string): string {
	return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "");
}

function unescapeYpNoteText(text: string): string {
	let out = "";
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "\\" && i + 1 < text.length) {
			const n = text[i + 1];
			if (n === "n") {
				out += "\n";
				i++;
				continue;
			}
			if (n === "\\") {
				out += "\\";
				i++;
				continue;
			}
		}
		out += text[i];
	}
	return out;
}

function extractYpId(raw: string): { rest: string; id: string | null } {
	const m = raw.match(YP_ID_RE);
	if (!m?.[1]) return { rest: raw, id: null };
	return {
		rest: raw.replace(YP_ID_RE, "").replace(/\s+$/, "").trimEnd(),
		id: m[1],
	};
}

function parsePlanItemList(text: string): YesterdayPlanItem[] {
	const items: YesterdayPlanItem[] = [];
	let cur: YesterdayPlanItem | null = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trimEnd();
		const trimmed = line.trim();
		if (!trimmed) continue;
		const indented = /^(?: {2}|\t)/.test(line);
		if (indented && cur !== null) {
			const cont = line.replace(/^(?: {2}|\t)/, "");
			const noteMatch = cont.trim().match(YP_NOTE_RE);
			if (noteMatch?.[1] && noteMatch[2] !== undefined) {
				cur.notes.push({
					date: noteMatch[1],
					text: unescapeYpNoteText(noteMatch[2]),
				});
				continue;
			}
			cur.desc = cur.desc ? `${cur.desc}\n${cont}` : cont;
			continue;
		}
		if (cur) items.push(cur);
		const headRaw = /^[-*•]\s+/.test(trimmed) ? trimmed : trimmed;
		const { rest, id } = extractYpId(headRaw);
		const head = parseYesterdayPlanHead(rest);
		cur = {
			id: id || newYesterdayPlanItemId(),
			title: head.title,
			project: head.project,
			desc: "",
			notes: [],
			done: head.done,
		};
	}
	if (cur) items.push(cur);
	return items.filter((it) => it.title.trim());
}

/** 条目 → 「明日计划」段可见正文（不含 baseline 注释） */
export function serializeYesterdayPlanItems(items: YesterdayPlanItem[]): string {
	return items
		.map((it) => {
			const title = it.title.trim();
			if (!title) return "";
			const project = (it.project || YP_NO_PROJECT).trim() || YP_NO_PROJECT;
			const id = (it.id || newYesterdayPlanItemId()).trim();
			const mark = it.done ? "x" : " ";
			const head = `- [${mark}] **${title.replace(/\*\*/g, "")}** · ${project.replace(/\*\*/g, "")} <!--yp:${id}-->`;
			const parts = [head];
			const desc = it.desc.trim();
			if (desc) {
				parts.push(...desc.split(/\r?\n/).map((l) => `  ${l}`));
			}
			for (const n of it.notes ?? []) {
				const date = n.date.trim();
				const text = n.text.trim();
				if (!date || !text) continue;
				parts.push(`  - ${date} | ${escapeYpNoteText(text)}`);
			}
			return parts.join("\n");
		})
		.filter(Boolean)
		.join("\n");
}

function serializePlanSectionWithBaseline(
	items: YesterdayPlanItem[],
	baseline: YesterdayPlanItem[],
): string {
	const baseBody = serializeYesterdayPlanItems(baseline);
	const itemBody = serializeYesterdayPlanItems(items);
	const comment = baseBody
		? `${YP_BASELINE_OPEN}\n${baseBody}\n${YP_BASELINE_CLOSE}`
		: `${YP_BASELINE_OPEN}\n${YP_BASELINE_CLOSE}`;
	return itemBody ? `${comment}\n${itemBody}` : comment;
}

/** 取出「明日计划」段原始正文（不含 ## 标题行） */
export function extractTomorrowPlanSectionRaw(md: string): string {
	if (!md.trim()) return "";
	const lines = md.split(/\r?\n/);
	let inPlan = false;
	const body: string[] = [];
	for (const raw of lines) {
		const line = raw.trimEnd();
		if (/^##\s+/.test(line.trim())) {
			const title = line.trim().replace(/^##\s+/, "");
			if (inPlan) break;
			inPlan = title === "明日计划";
			continue;
		}
		if (inPlan) body.push(line);
	}
	return body.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

export function extractYesterdayPlanState(md: string): YesterdayPlanState {
	return parseYesterdayPlanSection(extractTomorrowPlanSectionRaw(md));
}

/** 只替换「明日计划」段内容，保留其它段落 */
export function replaceTomorrowPlanSection(
	md: string,
	items: YesterdayPlanItem[],
	baseline: YesterdayPlanItem[],
): string {
	const section = serializePlanSectionWithBaseline(items, baseline);
	const lines = md.split(/\r?\n/);
	const out: string[] = [];
	let inPlan = false;
	let planWritten = false;
	let foundPlan = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();
		if (/^##\s+/.test(trimmed)) {
			const title = trimmed.replace(/^##\s+/, "");
			if (inPlan) {
				inPlan = false;
			}
			if (title === "明日计划") {
				foundPlan = true;
				inPlan = true;
				out.push(line);
				if (section) out.push(section);
				planWritten = true;
				continue;
			}
			out.push(line);
			continue;
		}
		if (inPlan) continue;
		out.push(line);
	}
	if (!foundPlan) {
		const block = ["", "## 明日计划", section, ""].filter((x, i, a) => !(x === "" && i > 0 && a[i - 1] === "")).join("\n");
		return `${md.replace(/\s*$/, "")}\n${block}\n`;
	}
	if (!planWritten && section) {
		/* unreachable when foundPlan */
	}
	return out.join("\n").replace(/\n+$/, "\n");
}

export function isDailyDraftWorthArchiving(
	draft: Pick<DailyReportDraft, "work" | "plan" | "planItems" | "discuss">,
): boolean {
	if (draft.work.trim()) return true;
	if (draft.plan.trim()) return true;
	if (Array.isArray(draft.planItems) && draft.planItems.some((it) => {
		const raw = it as TomorrowPlanItem & { text?: string };
		const title = typeof raw.title === "string"
			? raw.title.trim()
			: typeof raw.text === "string"
				? raw.text.trim()
				: "";
		return !!title;
	})) return true;
	const discuss = draft.discuss.trim();
	if (discuss && discuss !== DEFAULT_DAILY_DISCUSS) return true;
	return false;
}

export function draftToArchivePayload(draft: DailyReportDraft | DailyReportDraftSettings): DailyArchivePayload {
	const items: TomorrowPlanItem[] = Array.isArray(draft.planItems)
		? draft.planItems.map((it) => coercePlanItem(it)).filter((it): it is TomorrowPlanItem => !!it)
		: [];
	const plan = items.length
		? serializeYesterdayPlanItems(items.map((it) => ({
			id: it.id,
			title: it.title,
			project: it.project,
			desc: it.desc,
			notes: it.notes,
			done: it.done,
		})))
		: (draft.plan?.trim() ?? "");
	return {
		date: draft.date,
		work: draft.work ?? "",
		plan,
		discuss: draft.discuss ?? DEFAULT_DAILY_DISCUSS,
	};
}

export function parseYesterdayPlanQuickLines(raw: string): string[] {
	return raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
}

export function yesterdayPlanListHtml(opts: {
	items: YesterdayPlanItem[];
	selectedId?: string | null;
	emptyText?: string;
	reportDate?: string;
	/** 只读：无勾选/删除/点击编辑（日历日详情） */
	readonly?: boolean;
}): string {
	const reportAttr = opts.reportDate ? ` data-yp-report="${esc(opts.reportDate)}"` : "";
	const readonly = opts.readonly === true;
	if (!opts.items.length) {
		return `<div class="ztk-yp-list-root"${reportAttr}><p class="ztk-yesterday-plan-empty">${esc(opts.emptyText ?? "暂无计划")}</p></div>`;
	}
	return `<div class="ztk-yp-list-root"${reportAttr}><div class="ztk-yesterday-plan-list${readonly ? " is-readonly" : ""}">${opts.items
		.map((it) => {
			const projectTag = it.project.trim() && it.project.trim() !== YP_NO_PROJECT
				? projectBadgeHtml(it.project)
				: "";
			if (readonly) {
				return `
			<div class="ztk-day-plan${it.done ? " is-done" : ""}">
				<span class="ztk-day-plan-title">${esc(it.title)}</span>
				${projectTag}
			</div>`;
			}
			const meta = projectTag ? `<div class="ztk-meta">${projectTag}</div>` : "";
			return `
			<div class="ztk-task ztk-yp-task${it.done ? " is-done" : ""}${opts.selectedId === it.id ? " sel" : ""}" data-act="toggle-yesterday-plan" data-yp-id="${esc(it.id)}" role="button" tabindex="0" title="点击勾选完成">
				<label class="ztk-yp-check-wrap" title="${it.done ? "标记未完成" : "标记完成"}">
					<input type="checkbox" class="ztk-yp-check"${it.done ? " checked" : ""} tabindex="-1" />
				</label>
				<div class="ztk-task-main">
					<h3>${esc(it.title)}</h3>
					${meta}
				</div>
				<div class="ztk-task-trail">
					${iconBtn("edit-yesterday-plan", "edit", "编辑", `data-yp-id="${esc(it.id)}"`)}
					${iconBtn("del-yesterday-plan", "del", "删除", `data-yp-id="${esc(it.id)}"`)}
				</div>
			</div>`;
		})
		.join("")}</div></div>`;
}

export function yesterdayPlanBlockHtml(opts: {
	items: YesterdayPlanItem[];
	selectedId?: string | null;
	collapsed?: boolean;
	/** 计划所属日（计划是为哪天准备的）；对应日报日期为 D-1；仅用于 data 属性，不展示日期控件 */
	planDay?: string;
}): string {
	const collapsed = opts.collapsed === true;
	const planDay = opts.planDay?.trim() || "";
	const list = yesterdayPlanListHtml({
		items: opts.items,
		selectedId: opts.selectedId,
		emptyText: "暂无计划",
		reportDate: planDay ? planReportDateForDay(planDay) : undefined,
	});
	return `
		<div class="ztk-card ztk-yesterday-plan${collapsed ? " is-collapsed" : ""}"${planDay ? ` data-yp-report="${esc(planReportDateForDay(planDay))}"` : ""}>
			<div class="ztk-yesterday-plan-head">
				<div class="ztk-section-title">
					<button type="button" class="ztk-ghost ztk-section-collapse" data-act="toggle-board-section" data-section="yesterday" title="${collapsed ? "展开" : "折叠"}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "展开" : "折叠"}">${collapsed ? "▸" : "▾"}</button>
					<h2>昨日计划</h2>
				</div>
				<div class="ztk-yesterday-plan-actions">
					<button type="button" class="ztk-ghost" data-act="yp-quick-add" title="按行批量新增">批量新增</button>
					<button type="button" class="ztk-btn" data-act="reset-yesterday-plan" title="恢复为归档基线">重置</button>
				</div>
			</div>
			<div class="ztk-collapsible-body">
				${list}
				<div class="ztk-plan-add">
					<input type="text" class="ztk-plan-add-input" placeholder="新建昨日计划，回车添加" />
					<button type="button" class="ztk-ghost ztk-plan-add-btn" data-act="add-yp-plan-item" title="添加" aria-label="添加">+</button>
				</div>
			</div>
		</div>
	`;
}

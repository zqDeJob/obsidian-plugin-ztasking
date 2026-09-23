import { Component, ItemView, MarkdownRenderer, Menu, Modal, Notice, Platform, TFile, type App, type WorkspaceLeaf } from "obsidian";
import type ZTaskingPlugin from "./main";
import {
	STATUS_LABEL,
	TYPE_LABEL,
	VIEW_TYPE,
	addDays,
	daysBetween,
	esc,
	fmt,
	formatHours,
	parseDate,
	parseHoursInput,
	todayStr,
	type Task,
	type TaskStatus,
	type TaskType,
} from "./model";
import { copyText } from "./clipboard";
import {
	newYesterdayPlanItemId,
	parseYesterdayPlanQuickLines,
	planReportDateForDay,
	prevDateStr,
	resolveYpDefaultProject,
	withYpNoProjectOption,
	yesterdayPlanBlockHtml,
	yesterdayPlanListHtml,
	YP_NO_PROJECT,
	type YesterdayPlanItem,
} from "./daily-archive";
import {
	assembleDailyReportText,
	emptyDailyDraft,
	newPlanItemId,
	planItemsToText,
	refreshDailyDraft,
	textToPlanItems,
	tomorrowPlanListHtml,
} from "./daily-report";
import { descBlockHtml } from "./desc";
import { iconBtn } from "./icons";
import {
	buildGanttUnits,
	ganttScaleForDays,
	matchPeriodPreset,
	normalizeDateRange,
	resolvePeriodRange,
	type PeriodPreset,
	type PeriodRange,
} from "./period";
import {
	DEFAULT_PROJECT,
	filterByProject,
	normalizeProjectName,
	remapPathsAfterProjectRename,
	resolveNewTaskProject,
	resolveProjectSelectValue,
} from "./project";
import {
	formatReportLogsCopyText,
	groupReportLogsByTask,
	highlightElementText,
	hoursBadgeHtml,
	mdSlotHtml,
	projectBadgeHtml,
	reportLogRowHtml,
	reportLogsHeadHtml,
	reportMergedGroupHtml,
	reportTaskCountRowHtml,
	sumHours,
	todayDigestHtml,
} from "./report";
import {
	applyCatalogSort,
	nextCatalogSort,
	taskPeriodOverlaps,
	type CatalogSort,
	type CatalogSortKey,
} from "./catalog";
import { isSidebarStatusFilter, matchSidebarStatus, mergeSidebarOrder, reorderSidebarIds, type SidebarStatusFilter } from "./sidebar";
import { WebPanel } from "./web-panel";

type BoardView = "board" | "detail" | "cal" | "gantt" | "report" | "web";
type TopTab = "report" | "work" | "schedule" | "web";
type ScheduleMode = "cal" | "gantt";
const VIEWS: BoardView[] = ["board", "detail", "cal", "gantt", "report", "web"];
const PERIOD_SHORTCUTS = ["week", "month", "quarter", "year"] as const;
const YP_DRAWER_NEW = "__new__";

/** Obsidian Modal 确认，避免 window.confirm 在 Electron 里弄丢输入焦点 */
function askConfirm(app: App, title: string, message: string, okLabel = "确定"): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const done = (ok: boolean) => {
			if (settled) return;
			settled = true;
			resolve(ok);
		};
		const danger = /删|删除|清空|重置/.test(okLabel);
		const modal = new class extends Modal {
			onOpen(): void {
				this.modalEl.addClass("ztk-bm-modal");
				this.contentEl.empty();
				this.contentEl.addClass("ztk-bm-modal-body");
				this.contentEl.createDiv({ cls: "ztk-bm-modal-eyebrow", text: "Z-Tasking" });
				this.contentEl.createEl("h2", { text: title });
				this.contentEl.createEl("p", { cls: "ztk-bm-modal-lead", text: message });
				const actions = this.contentEl.createDiv({ cls: "ztk-bm-modal-actions" });
				actions.createEl("button", { type: "button", cls: "ztk-ghost", text: "取消" })
					.addEventListener("click", () => {
						done(false);
						this.close();
					});
				actions.createEl("button", {
					type: "button",
					cls: danger ? "ztk-btn ztk-btn-danger" : "ztk-btn",
					text: okLabel,
				}).addEventListener("click", () => {
					done(true);
					this.close();
				});
			}
			onClose(): void {
				this.contentEl.empty();
				done(false);
			}
		}(app);
		modal.open();
	});
}

/** 昨日计划批量新增：日期 + 多行标题 + 所属项目 */
function askYpQuickAdd(
	app: App,
	projects: string[],
	defaultProject: string,
	defaultPlanDay: string,
): Promise<{ text: string; project: string; planDay: string } | null> {
	return new Promise((resolve) => {
		let settled = false;
		const done = (v: { text: string; project: string; planDay: string } | null) => {
			if (settled) return;
			settled = true;
			resolve(v);
		};
		const modal = new class extends Modal {
			onOpen(): void {
				this.modalEl.addClass("ztk-bm-modal");
				this.modalEl.addClass("ztk-yp-quick-modal");
				this.contentEl.empty();
				this.contentEl.addClass("ztk-bm-modal-body");
				this.contentEl.createDiv({ cls: "ztk-bm-modal-eyebrow", text: "Z-Tasking" });
				this.contentEl.createEl("h2", { text: "批量新增昨日计划" });
				this.contentEl.createEl("p", {
					cls: "ztk-bm-modal-lead",
					text: "日期是计划要执行的那天（默认今天→写入昨天日报）。一行一条标题。",
				});

				const dayLabel = this.contentEl.createEl("label", {
					cls: "ztk-yp-quick-field",
					text: "计划所属日期",
				});
				const dayInput = dayLabel.createEl("input", {
					cls: "ztk-yp-quick-day",
					attr: { type: "date", value: defaultPlanDay },
				});

				const projectLabel = this.contentEl.createEl("label", {
					cls: "ztk-yp-quick-field",
					text: "所属项目",
				});
				const projectSel = projectLabel.createEl("select", { cls: "ztk-yp-quick-project" });
				const opts = withYpNoProjectOption(
					projects.includes(defaultProject) ? projects : [...projects, defaultProject],
				);
				for (const p of opts) {
					projectSel.createEl("option", { value: p, text: p });
				}
				projectSel.value = defaultProject || YP_NO_PROJECT;

				const textLabel = this.contentEl.createEl("label", {
					cls: "ztk-yp-quick-field",
					text: "计划标题",
				});
				const textArea = textLabel.createEl("textarea", {
					cls: "ztk-yp-quick-input",
					attr: {
						rows: "8",
						placeholder: "一行一条，例如：\n写单测\n改 UI",
					},
				});

				const actions = this.contentEl.createDiv({ cls: "ztk-bm-modal-actions" });
				actions.createEl("button", { type: "button", cls: "ztk-ghost", text: "取消" })
					.addEventListener("click", () => {
						done(null);
						this.close();
					});
				actions.createEl("button", {
					type: "button",
					cls: "ztk-btn",
					text: "保存",
				}).addEventListener("click", () => {
					done({
						text: textArea.value,
						project: projectSel.value.trim() || YP_NO_PROJECT,
						planDay: dayInput.value.trim() || defaultPlanDay,
					});
					this.close();
				});
				requestAnimationFrame(() => textArea.focus());
			}
			onClose(): void {
				this.contentEl.empty();
				done(null);
			}
		}(app);
		modal.open();
	});
}

export class ZTaskingView extends ItemView {
	plugin: ZTaskingPlugin;
	view: BoardView = "report";
	/** 日历顶栏下的子模式（日历 / 甘特） */
	scheduleMode: ScheduleMode = "cal";
	period: PeriodPreset = "week";
	rangeStart = "";
	rangeEnd = "";
	/** 任务表类型筛选（含全部） */
	typeFilter: "all" | TaskType = "all";
	/** 任务表状态筛选（含「不包括」） */
	statusFilter: SidebarStatusFilter = "all";
	query = "";
	/** 任务表日期范围（空 = 不限） */
	catalogDateStart = "";
	catalogDateEnd = "";
	/** 任务表列排序；null = 拖拽手动序 */
	catalogSort: CatalogSort = null;
	selectedId = "";
	calCursor = new Date();
	selectedDay = todayStr();
	ganttTaskId = "";
	editingLogDate: string | null = null;
	/** 昨日计划笔记编辑下标（item.notes 原数组） */
	private editingYpNoteIdx: number | null = null;
	editingDesc = false;
	editingTitle = false;
	/** 汇总进展明细：按任务聚合查看 */
	reportByTask = false;
	/** 汇总进展明细：搜索关键字（高亮，不筛选） */
	reportQuery = "";
	/** 业务项目筛选：all = 全部 */
	projectFilter = "all";
	private mdRoot = new Component();
	private mdGen = 0;
	private webPanel: WebPanel;
	/** 工作台两列：左侧三卡 / 右侧任务表 的相对宽度 */
	private leftPaneRatio = 0.38;
	private boardSplittersBound = false;
	/** 拖拽排序结束后抑制一次 click，避免误选中 */
	private suppressTaskClick = false;
	/** 工作台左栏三卡折叠（会话内） */
	private boardCollapsed = { yesterday: false, today: false, plan: false };
	/** 任务详情抽屉是否打开（默认关闭） */
	private detailOpen = false;
	/** 项目管理抽屉（与任务/昨日计划抽屉互斥） */
	private projectMgrOpen = false;
	/** 项目管理：正在行内重命名的项目名 */
	private projectMgrRenameFrom: string | null = null;
	/** 昨日计划抽屉：null 关闭；YP_DRAWER_NEW 新增；否则为条目 id */
	private ypDrawerId: string | null = null;
	/** 抽屉/批量写入锁定的日报日期（空则用左侧昨日计划对应日报） */
	private ypEditReportDate = "";
	private boardPlanCache: {
		path: string | null;
		items: YesterdayPlanItem[];
		baseline: YesterdayPlanItem[];
		reportDate: string;
	} = { path: null, items: [], baseline: [], reportDate: "" };
	private calPlanCache: {
		path: string | null;
		items: YesterdayPlanItem[];
		baseline: YesterdayPlanItem[];
		reportDate: string;
	} = { path: null, items: [], baseline: [], reportDate: "" };

	constructor(leaf: WorkspaceLeaf, plugin: ZTaskingPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.webPanel = new WebPanel(plugin);
	}

	/** 左侧「昨日计划」对应的计划所属日 = 今天（内容在昨天日报的「明日计划」） */
	private boardYpPlanDay(): string {
		return todayStr();
	}

	/** 左侧「昨日计划」读取的日报日期 = 昨天 */
	private boardYpReportDate(): string {
		return prevDateStr(todayStr());
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Z-Tasking";
	}

	getIcon(): string {
		return "calendar-check";
	}

	async onOpen(): Promise<void> {
		this.selectedId = "";
		this.detailOpen = false;
		this.contentEl.empty();
		this.contentEl.addClass("ztk-view");
		this.contentEl.innerHTML = `
			<header class="ztk-header">
				<div class="ztk-brand">Z-TASKING<span>任务台</span></div>
				<div class="ztk-tabs">
					<button data-tab="report" class="on" type="button">汇总</button>
					<button data-tab="work" type="button">工作台</button>
					<button data-tab="schedule" type="button">日历</button>
					${Platform.isDesktopApp ? `<button data-tab="web" type="button">网页</button>` : ""}
				</div>
				<div class="ztk-spacer"></div>
				<select class="ztk-project-filter" aria-label="业务项目">
					<option value="all" selected>全部项目</option>
				</select>
				<div class="ztk-period">
					<div class="ztk-period-presets" role="group" aria-label="周期快捷">
						<button data-p="week" class="on" type="button">周</button>
						<button data-p="month" type="button">月</button>
						<button data-p="quarter" type="button">季</button>
						<button data-p="year" type="button">年</button>
					</div>
					<div class="ztk-period-custom">
						<span class="ztk-period-sep">自定</span>
						<input type="date" class="ztk-range-start" aria-label="开始日期" />
						<span class="ztk-period-tilde">~</span>
						<input type="date" class="ztk-range-end" aria-label="结束日期" />
					</div>
				</div>
				<button class="ztk-btn is-hidden" data-act="new" type="button">新建任务</button>
				<button class="ztk-btn is-hidden" data-act="project-mgr" type="button">项目管理</button>
			</header>
			<main class="ztk-main">
				<div class="ztk-page" id="ztk-view-board" data-detail-open="0">
					<aside class="ztk-board-left">
						<div class="ztk-board-yesterday"></div>
						<div class="ztk-board-today"></div>
						<div class="ztk-board-plan"></div>
					</aside>
					<div class="ztk-splitter" data-split="left-list" title="拖拽调整宽度"></div>
					<aside class="ztk-list">
						<div class="ztk-filters"></div>
						<div class="ztk-catalog-body"></div>
					</aside>
					<div class="ztk-detail-drawer" aria-hidden="true">
						<div class="ztk-detail-backdrop" data-act="close-detail"></div>
						<article class="ztk-detail"></article>
					</div>
				</div>
				<div class="ztk-page" id="ztk-view-cal">
					<div class="ztk-cal-grid">
						<div class="ztk-cal-toolbar">
							<button class="ztk-ghost" data-act="cal-prev" type="button">上一月</button>
							<strong class="ztk-cal-title"></strong>
							<button class="ztk-ghost" data-act="cal-next" type="button">下一月</button>
							<button class="ztk-ghost" data-act="cal-today" type="button">今天</button>
							<span class="ztk-spacer"></span>
							<button class="ztk-ghost ztk-cal-day-toggle ztk-cal-day-toggle--bar" data-act="toggle-cal-day" type="button">折叠详情</button>
							<button class="ztk-ghost" data-act="goto-gantt" type="button">甘特图</button>
						</div>
						<div class="ztk-cal-body">
							<div class="ztk-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
							<div class="ztk-days"></div>
						</div>
					</div>
					<aside class="ztk-day-pane"></aside>
				</div>
				<div class="ztk-page" id="ztk-view-gantt">
					<div class="ztk-gantt-toolbar">
						<button class="ztk-ghost" data-act="goto-cal" type="button">日历</button>
						<div class="ztk-gantt-hint"></div>
					</div>
					<div class="ztk-gantt-pane"></div>
					<div class="ztk-gantt-logs"></div>
				</div>
				<div class="ztk-page on" id="ztk-view-report"></div>
				<div class="ztk-page" id="ztk-view-web"></div>
			</main>
			<div class="ztk-modal">
				<form class="ztk-modal-card">
					<h2>新建任务</h2>
					<div class="ztk-form">
						<input name="title" required placeholder="任务标题" />
						<textarea name="desc" placeholder="说明：这件事项要达成什么"></textarea>
						<label class="ztk-field">
							<span>业务项目</span>
							<select name="project" required aria-label="业务项目"></select>
						</label>
						<div class="ztk-two">
							<select name="type">
								<option value="long">长期任务</option>
								<option value="temp">临时任务</option>
								<option value="bug">缺陷</option>
							</select>
							<select name="status">
								<option value="todo">未开始</option>
								<option value="doing">进行中</option>
								<option value="done">已完结</option>
							</select>
						</div>
						<div class="ztk-two">
							<input type="date" name="start" required />
							<input type="date" name="end" required />
						</div>
					</div>
					<div class="ztk-modal-actions">
						<button type="button" class="ztk-ghost" data-act="cancel">取消</button>
						<button class="ztk-btn" type="submit">创建</button>
					</div>
				</form>
			</div>
		`;
		this.bind();
		this.bindBoardSplitters();
		this.applyPeriodShortcut("week");
		try {
			await this.plugin.store.reload();
		} catch (err) {
			console.error("Z-Tasking reload", err);
			new Notice("Z-Tasking 加载失败，请查看控制台");
		}
		this.renderAll();
		requestAnimationFrame(() => this.applyBoardLayout());
	}

	async onClose(): Promise<void> {
		this.webPanel.destroy();
		this.mdRoot.unload();
	}

	async refresh(): Promise<void> {
		await this.plugin.store.reload();
		if (this.selectedId && !this.plugin.store.tasks.some((t) => t.id === this.selectedId)) {
			this.selectedId = "";
			this.detailOpen = false;
		}
		this.renderAll();
	}

	private tasks(): Task[] {
		return this.plugin.store.tasks;
	}

	private projectTasks(): Task[] {
		return filterByProject(this.tasks(), this.projectFilter);
	}

	private syncProjectFilterOptions(): void {
		const sel = this.contentEl.querySelector(".ztk-project-filter") as HTMLSelectElement | null;
		if (!sel) return;
		const projects = this.plugin.store.projects;
		const cur = this.projectFilter;
		sel.innerHTML = `<option value="all">全部项目</option>${
			projects.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("")
		}`;
		sel.value = cur === "all" || projects.includes(cur) ? cur : "all";
		if (sel.value !== this.projectFilter) this.projectFilter = sel.value;
	}

	private $(sel: string): HTMLElement {
		const el = this.contentEl.querySelector(sel);
		if (!el) throw new Error(`missing ${sel}`);
		return el as HTMLElement;
	}

	private periodRange(): PeriodRange {
		const r = normalizeDateRange(this.rangeStart || todayStr(), this.rangeEnd || todayStr());
		const preset = matchPeriodPreset(r.startStr, r.endStr, todayStr());
		if (preset !== "custom") {
			const named = resolvePeriodRange(preset, todayStr());
			return { ...r, label: named.label, preset };
		}
		return { ...r, label: "自定", preset: "custom" };
	}

	private applyPeriodShortcut(preset: (typeof PERIOD_SHORTCUTS)[number]): void {
		const r = resolvePeriodRange(preset, todayStr());
		this.period = preset;
		this.rangeStart = r.startStr;
		this.rangeEnd = r.endStr;
		this.syncPeriodControls();
	}

	private applyCustomRangeFromInputs(): void {
		const startEl = this.contentEl.querySelector(".ztk-range-start") as HTMLInputElement | null;
		const endEl = this.contentEl.querySelector(".ztk-range-end") as HTMLInputElement | null;
		const start = startEl?.value || this.rangeStart || todayStr();
		const end = endEl?.value || this.rangeEnd || todayStr();
		const r = normalizeDateRange(start, end);
		this.rangeStart = r.startStr;
		this.rangeEnd = r.endStr;
		this.period = matchPeriodPreset(r.startStr, r.endStr, todayStr());
		this.syncPeriodControls();
	}

	private syncPeriodControls(): void {
		this.contentEl.querySelectorAll<HTMLButtonElement>(".ztk-period button[data-p]").forEach((b) => {
			b.classList.toggle("on", b.dataset.p === this.period);
		});
		this.$(".ztk-period").classList.toggle("is-custom", this.period === "custom");
		const startEl = this.contentEl.querySelector(".ztk-range-start") as HTMLInputElement | null;
		const endEl = this.contentEl.querySelector(".ztk-range-end") as HTMLInputElement | null;
		if (startEl) startEl.value = this.rangeStart;
		if (endEl) endEl.value = this.rangeEnd;
	}

	private refreshPeriodViews(): void {
		this.mdGen += 1;
		const gen = this.mdGen;
		this.renderGantt();
		this.renderReport();
		void this.paintMarkdown(gen);
	}

	private inRange(date: string, range: { start: Date; end: Date }): boolean {
		if (!date) return false;
		const d = parseDate(date);
		return d >= range.start && d <= range.end;
	}

	private filtered(): Task[] {
		return this.projectTasks().filter((t) =>
			(this.typeFilter === "all" || t.type === this.typeFilter) &&
			matchSidebarStatus(t.status, this.statusFilter)
		);
	}

	private catalogFiltered(): Task[] {
		const q = this.query.trim().toLowerCase();
		const base = this.filtered().filter((t) => {
			if (q && !t.title.toLowerCase().includes(q) && !t.desc.toLowerCase().includes(q)) return false;
			return taskPeriodOverlaps(t, this.catalogDateStart, this.catalogDateEnd);
		});
		if (this.catalogSort) return applyCatalogSort(base, this.catalogSort);
		const byType: Record<TaskType, Task[]> = { long: [], temp: [], bug: [] };
		for (const t of base) byType[t.type].push(t);
		const out: Task[] = [];
		for (const type of ["long", "temp", "bug"] as const) {
			const group = byType[type];
			if (!group.length) continue;
			const saved = this.plugin.settings.sidebarOrder?.[type] ?? [];
			const ids = mergeSidebarOrder(group, saved);
			for (const id of ids) {
				const t = group.find((x) => x.id === id);
				if (t) out.push(t);
			}
		}
		return out;
	}

	private topTabFor(view: BoardView): TopTab {
		if (view === "report") return "report";
		if (view === "cal" || view === "gantt") return "schedule";
		if (view === "web") return "web";
		return "work";
	}

	private switchTopTab(tab: TopTab): void {
		if (tab === "report") this.switchView("report");
		else if (tab === "work") this.switchView("board");
		else if (tab === "schedule") this.switchView(this.scheduleMode);
		else if (tab === "web") this.switchView("web");
	}

	private switchView(view: BoardView): void {
		// 详情并入工作壳右侧抽屉，不再单独占页
		if (view === "detail" || (view as string) === "list") view = "board";
		this.view = view;
		if (view === "cal" || view === "gantt") this.scheduleMode = view;
		const topTab = this.topTabFor(view);
		this.contentEl.querySelectorAll(".ztk-tabs button").forEach((b) =>
			b.classList.toggle("on", (b as HTMLElement).dataset.tab === topTab));
		const pageId = this.pageIdFor(view);
		for (const v of VIEWS) {
			const page = this.contentEl.querySelector(`#ztk-view-${v}`);
			if (!page) continue;
			page.classList.toggle("on", v === pageId);
		}
		this.syncPeriodVisibility();
		this.syncPeriodControls();
		this.mdGen += 1;
		const gen = this.mdGen;
		if (view === "board") {
			this.syncWorkShell();
			this.renderDetail();
			requestAnimationFrame(() => this.applyBoardLayout());
		}
		if (view === "cal") this.renderCalendar();
		if (view === "gantt") this.renderGantt();
		if (view === "report") this.renderReport();
		if (view === "web") this.webPanel.mount(this.$("#ztk-view-web"));
		void this.paintMarkdown(gen);
	}

	private pageIdFor(view: BoardView): string {
		if (view === "detail") return "board";
		return view;
	}

	/** scope=project：随顶栏项目筛选；scope=all：全部项目（今天/日报/侧栏统计用） */
	private logsInPeriod(scope: "project" | "all" = "project") {
		const r = this.periodRange();
		const pool = scope === "all" ? this.tasks() : this.projectTasks();
		return pool.flatMap((t) => t.logs.filter((l) => this.inRange(l.date, r)).map((l) => ({ ...l, task: t })));
	}

	private logsOn(day: string, scope: "project" | "all" = "project") {
		const pool = scope === "all" ? this.tasks() : this.projectTasks();
		return pool.flatMap((t) => t.logs.filter((l) => l.date === day).map((l) => ({ ...l, task: t })));
	}

	private bind(): void {
		const root = this.contentEl;
		root.addEventListener("contextmenu", (e) => {
			this.openCopyMenu(e);
		});
		root.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			const selected = window.getSelection()?.toString() ?? "";
			if (selected && !target.closest("button, a, textarea, input, select, [data-act]")) {
				return;
			}
			const mdLink = target.closest<HTMLAnchorElement>("a.internal-link");
			const mdHost = target.closest<HTMLElement>(".ztk-md");
			if (mdLink && mdHost) {
				e.preventDefault();
				const href = mdLink.dataset.href || mdLink.getAttribute("href") || "";
				if (href) void this.app.workspace.openLinkText(href, mdHost.dataset.src || "");
				return;
			}
			const tab = target.closest<HTMLButtonElement>(".ztk-tabs button");
			if (
				tab?.dataset.tab === "report"
				|| tab?.dataset.tab === "work"
				|| tab?.dataset.tab === "schedule"
				|| tab?.dataset.tab === "web"
			) {
				this.switchTopTab(tab.dataset.tab);
				return;
			}
			const p = target.closest<HTMLButtonElement>(".ztk-period button[data-p]");
			if (p?.dataset.p && (PERIOD_SHORTCUTS as readonly string[]).includes(p.dataset.p)) {
				this.applyPeriodShortcut(p.dataset.p as (typeof PERIOD_SHORTCUTS)[number]);
				this.refreshPeriodViews();
				return;
			}
			const act = target.closest<HTMLElement>("[data-act]");
			if (act?.dataset.act) {
				const a = act.dataset.act;
				if (a === "new") void this.openModal();
				if (a === "project-mgr") void this.openProjectMgrDrawer();
				if (a === "cancel") this.closeModal();
				if (a === "pm-add") {
					void this.pmAddProject();
					return;
				}
				if (a === "pm-rename" && act.dataset.project) {
					this.projectMgrRenameFrom = act.dataset.project;
					this.renderDetail();
					return;
				}
				if (a === "pm-rename-cancel") {
					this.projectMgrRenameFrom = null;
					this.renderDetail();
					return;
				}
				if (a === "pm-rename-save" && act.dataset.project) {
					void this.pmRenameProject(act.dataset.project);
					return;
				}
				if (a === "pm-delete" && act.dataset.project) {
					void this.pmDeleteProject(act.dataset.project);
					return;
				}
				if (a === "goto-gantt") {
					this.switchView("gantt");
					return;
				}
				if (a === "goto-cal") {
					this.switchView("cal");
					return;
				}
				if (a === "cal-prev") {
					this.calCursor.setMonth(this.calCursor.getMonth() - 1);
					this.refreshCalendar();
				}
				if (a === "cal-next") {
					this.calCursor.setMonth(this.calCursor.getMonth() + 1);
					this.refreshCalendar();
				}
				if (a === "cal-today") {
					this.calCursor = new Date();
					this.selectedDay = todayStr();
					this.refreshCalendar();
				}
				if (a === "toggle-cal-day") {
					void this.toggleCalDayPane();
					return;
				}
				if (a === "toggle-board-section") {
					const section = act.dataset.section;
					if (section === "yesterday" || section === "today" || section === "plan") {
						this.boardCollapsed[section] = !this.boardCollapsed[section];
						if (section === "yesterday") this.renderBoardYesterday();
						else if (section === "today") this.renderBoardToday();
						else this.renderBoardPlan();
					}
					return;
				}
				if (a === "catalog-sort") {
					const key = act.dataset.key as CatalogSortKey | undefined;
					if (key === "type" || key === "status" || key === "hours") {
						this.catalogSort = nextCatalogSort(this.catalogSort, key);
						this.renderCatalog();
					}
					return;
				}
				if (a === "add-log") void this.addTodayLog();
				if (a === "report-view-mode") {
					const next = act.dataset.mode === "task";
					if (this.reportByTask === next) return;
					this.reportByTask = next;
					this.mdGen += 1;
					const gen = this.mdGen;
					this.renderReport();
					void this.paintMarkdown(gen);
					return;
				}
				if (a === "copy-report-logs") {
					void this.copyReportLogs();
					return;
				}
				if (a === "copy-daily-report") {
					void this.copyDailyReport();
					return;
				}
				if (a === "reset-daily-work") {
					void this.resetDailyReportWork();
					return;
				}
				if (a === "reset-daily-plan") {
					void this.resetDailyReportPlan();
					return;
				}
				if (a === "add-plan-item") {
					const wrap = act.closest(".ztk-plan-add");
					const input = wrap?.querySelector<HTMLInputElement>(".ztk-plan-add-input");
					void this.addTomorrowPlanItem(input?.value);
					return;
				}
				if (a === "del-plan-item" && act.dataset.planId) {
					void this.removeTomorrowPlanItem(act.dataset.planId);
					return;
				}
				if (a === "add-yesterday-plan") {
					const report = act.closest<HTMLElement>("[data-yp-report]")?.dataset.ypReport;
					void this.openYpDrawer(null, report);
					return;
				}
				if (a === "yp-quick-add") {
					const report = act.closest<HTMLElement>("[data-yp-report]")?.dataset.ypReport
						|| this.boardYpReportDate();
					this.ypEditReportDate = report;
					void this.ypQuickAdd();
					return;
				}
				if (a === "reset-yesterday-plan") {
					const report = act.closest<HTMLElement>("[data-yp-report]")?.dataset.ypReport;
					if (report) this.ypEditReportDate = report;
					void this.resetYesterdayPlan();
					return;
				}
				if (a === "edit-yesterday-plan" && act.dataset.ypId) {
					const report = act.closest<HTMLElement>("[data-yp-report]")?.dataset.ypReport;
					void this.openYpDrawer(act.dataset.ypId, report);
					return;
				}
				if (a === "toggle-yesterday-plan" && act.dataset.ypId) {
					const report = act.closest<HTMLElement>("[data-yp-report]")?.dataset.ypReport;
					if (report) this.ypEditReportDate = report;
					void this.toggleYesterdayPlanDone(act.dataset.ypId);
					return;
				}
				if (a === "del-yesterday-plan" && act.dataset.ypId) {
					const report = act.closest<HTMLElement>("[data-yp-report]")?.dataset.ypReport;
					if (report) this.ypEditReportDate = report;
					void this.deleteYesterdayPlanItem(act.dataset.ypId);
					return;
				}
				if (a === "cal-add-plan") {
					void this.openYpDrawer(null, planReportDateForDay(this.selectedDay));
					return;
				}
				if (a === "yp-drawer-add-log") {
					void this.ypDrawerAddLog();
					return;
				}
				if (a === "yp-drawer-save") {
					void this.ypDrawerSaveFields();
					return;
				}
				if (a === "close-detail") {
					this.closeDetailDrawer();
					return;
				}
				if (a === "edit-log" || a === "save-log" || a === "cancel-log" || a === "del-log") {
					if (this.ypDrawerId) {
						const idxRaw = act.closest<HTMLElement>("[data-yp-note-idx]")?.dataset.ypNoteIdx;
						const idx = idxRaw !== undefined ? Number(idxRaw) : NaN;
						if (Number.isInteger(idx) && idx >= 0) void this.handleYpNoteAction(a, idx);
						return;
					}
					const id = act.dataset.id || act.closest<HTMLElement>("[data-id]")?.dataset.id;
					if (id) this.selectedId = id;
					const date = act.dataset.date || act.closest<HTMLElement>("[data-date]")?.dataset.date;
					if (date) void this.handleLogAction(a, date);
					return;
				}
				if (a === "copy-log") {
					if (this.ypDrawerId) {
						const idxRaw = act.closest<HTMLElement>("[data-yp-note-idx]")?.dataset.ypNoteIdx;
						const idx = idxRaw !== undefined ? Number(idxRaw) : NaN;
						if (Number.isInteger(idx) && idx >= 0) void this.copyYpNote(idx);
						return;
					}
					const date = act.closest<HTMLElement>("[data-date]")?.dataset.date;
					if (date) void this.copyLog(date);
					return;
				}
				if (a === "edit-desc" || a === "save-desc" || a === "cancel-desc") {
					void this.handleDescAction(a);
					return;
				}
				if (a === "edit-title" || a === "save-title" || a === "cancel-title") {
					void this.handleTitleAction(a);
					return;
				}
				if (a === "copy-desc") {
					void this.copyDesc();
					return;
				}
				if (a === "copy-md") {
					void this.copyByPathDate(act.dataset.path ?? "", act.dataset.date ?? "");
					return;
				}
				if (a === "goto-task" && act.dataset.id) {
					if (this.suppressTaskClick || target.closest(".ztk-drag-handle")) return;
					this.openTaskDetail(act.dataset.id);
					if (this.view === "board") {
						this.syncWorkShell();
						this.syncDetailDrawer();
						this.rerenderDetail();
					} else {
						this.switchView("board");
						this.renderAll();
					}
					return;
				}
				if (a === "del-task" && act.dataset.id) {
					void this.deleteTaskById(act.dataset.id);
					return;
				}
				if (a === "back-list" || a === "open-list") {
					this.switchView("board");
					this.renderAll();
					return;
				}
				return;
			}
			const chip = target.closest<HTMLElement>(".ztk-chip");
			if (chip?.dataset.k) {
				this.typeFilter = chip.dataset.k as "all" | TaskType;
				this.renderFilters();
				this.renderCatalog();
				return;
			}
			const taskEl = target.closest<HTMLElement>(".ztk-task");
			if (taskEl?.dataset.id) {
				if (this.suppressTaskClick || target.closest(".ztk-drag-handle")) return;
				this.openTaskDetail(taskEl.dataset.id);
				this.renderAll();
				return;
			}
			const day = target.closest<HTMLElement>(".ztk-day");
			if (day?.dataset.day) {
				this.selectedDay = day.dataset.day;
				this.refreshCalendar();
				return;
			}
			const grow = target.closest<HTMLElement>("[data-gid]");
			if (grow?.dataset.gid) {
				this.ganttTaskId = grow.dataset.gid;
				this.refreshGantt();
			}
		});
		root.addEventListener("change", (e) => {
			const el = e.target as HTMLElement;
			if (el.classList.contains("ztk-project-filter")) {
				this.projectFilter = (el as HTMLSelectElement).value || "all";
				this.mdGen += 1;
				const gen = this.mdGen;
				this.renderAll();
				void this.paintMarkdown(gen);
				return;
			}
			if (el.classList.contains("ztk-today-group-by-project")) {
				this.plugin.settings.todayGroupByProject = (el as HTMLInputElement).checked;
				void this.plugin.saveSettings();
				this.mdGen += 1;
				const gen = this.mdGen;
				this.renderBoardToday(this.view === "board");
				if (this.view === "report") this.renderReport();
				void this.paintMarkdown(gen);
				return;
			}
			if (el.classList.contains("ztk-type-filter")) {
				const v = (el as HTMLSelectElement).value;
				if (v === "all" || v === "long" || v === "temp" || v === "bug") {
					this.typeFilter = v;
					this.renderFilters();
					this.renderCatalog();
				}
				return;
			}
			if (el.classList.contains("ztk-status-filter")) {
				const v = (el as HTMLSelectElement).value;
				if (isSidebarStatusFilter(v)) {
					this.statusFilter = v;
					this.renderFilters();
					this.renderCatalog();
				}
				return;
			}
			if (el.classList.contains("ztk-task-status")) {
				void this.changeStatus((el as HTMLSelectElement).value as TaskStatus);
			}
			if (el.classList.contains("ztk-task-type")) {
				void this.changeType((el as HTMLSelectElement).value as TaskType);
			}
			if (el.classList.contains("ztk-task-project")) {
				void this.changeProject((el as HTMLInputElement | HTMLSelectElement).value);
			}
			if (el.classList.contains("ztk-yp-project")) {
				void this.ypDrawerSaveFields();
			}
			if (el.classList.contains("ztk-range-start") || el.classList.contains("ztk-range-end")) {
				this.applyCustomRangeFromInputs();
				this.refreshPeriodViews();
			}
			if (el.classList.contains("ztk-catalog-date-start")) {
				this.catalogDateStart = (el as HTMLInputElement).value;
				this.renderFilters();
				this.renderCatalog();
			}
			if (el.classList.contains("ztk-catalog-date-end")) {
				this.catalogDateEnd = (el as HTMLInputElement).value;
				this.renderFilters();
				this.renderCatalog();
			}
		});
		root.addEventListener("input", (e) => {
			const el = e.target as HTMLElement;
			if (el.classList.contains("ztk-search")) {
				this.query = (el as HTMLInputElement).value;
				this.renderCatalog();
			}
			if (el.classList.contains("ztk-report-search")) {
				this.reportQuery = (el as HTMLInputElement).value;
				this.applyReportHighlight();
			}
			if (
				el.classList.contains("ztk-daily-work")
				|| el.classList.contains("ztk-daily-plan")
				|| el.classList.contains("ztk-daily-discuss")
			) {
				this.persistDailyReportField(el as HTMLTextAreaElement);
			}
			if (el.classList.contains("ztk-plan-item-input")) {
				this.persistPlanItemInput(el as HTMLInputElement);
			}
		});
		root.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && this.detailOpen) {
				const t = e.target as HTMLElement;
				if (t.closest?.("input, textarea, select, [contenteditable]")) return;
				e.preventDefault();
				this.closeDetailDrawer();
				return;
			}
			const el = e.target as HTMLElement;
			if (!(el instanceof HTMLInputElement)) return;
			if (el.classList.contains("ztk-pm-add-input") && e.key === "Enter") {
				e.preventDefault();
				void this.pmAddProject();
				return;
			}
			if (el.classList.contains("ztk-pm-rename-input") && e.key === "Enter") {
				e.preventDefault();
				const from = el.dataset.project;
				if (from) void this.pmRenameProject(from);
				return;
			}
			if (!el.classList.contains("ztk-plan-add-input")) return;
			if (e.key !== "Enter") return;
			e.preventDefault();
			void this.addTomorrowPlanItem(el.value);
		});
		this.$(".ztk-modal-card").addEventListener("submit", (e) => {
			e.preventDefault();
			void this.createTask(e.target as HTMLFormElement);
		});
		this.bindListReorder();
		window.addEventListener("resize", () => {
			if (this.view === "board") this.applyBoardLayout();
		});
	}

	private bindListReorder(): void {
		const root = this.contentEl;
		let dragId = "";
		const rowOf = (el: HTMLElement | null) =>
			el?.closest<HTMLElement>("tr[data-id], .ztk-task[data-id]") ?? null;
		const clearMarks = () => {
			root.querySelectorAll(".is-dragging, .is-drag-over").forEach((el) => {
				el.classList.remove("is-dragging", "is-drag-over");
			});
		};
		root.addEventListener("dragstart", (e) => {
			const handle = (e.target as HTMLElement).closest(".ztk-drag-handle") as HTMLElement | null;
			const row = rowOf(handle);
			if (!handle || !row?.dataset.id) {
				e.preventDefault();
				return;
			}
			dragId = row.dataset.id;
			row.classList.add("is-dragging");
			e.dataTransfer?.setData("text/plain", dragId);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});
		root.addEventListener("dragend", () => {
			dragId = "";
			clearMarks();
			this.suppressTaskClick = true;
			window.setTimeout(() => { this.suppressTaskClick = false; }, 0);
		});
		root.addEventListener("dragover", (e) => {
			const row = rowOf(e.target as HTMLElement);
			if (!row?.dataset.id || !dragId || row.dataset.id === dragId) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			root.querySelectorAll(".is-drag-over").forEach((el) => {
				if (el !== row) el.classList.remove("is-drag-over");
			});
			row.classList.add("is-drag-over");
		});
		root.addEventListener("dragleave", (e) => {
			const row = rowOf(e.target as HTMLElement);
			const related = e.relatedTarget as HTMLElement | null;
			if (row && related && row.contains(related)) return;
			row?.classList.remove("is-drag-over");
		});
		root.addEventListener("drop", (e) => {
			const row = rowOf(e.target as HTMLElement);
			const toId = row?.dataset.id ?? "";
			const fromId = dragId || e.dataTransfer?.getData("text/plain") || "";
			clearMarks();
			if (!fromId || !toId || fromId === toId) return;
			e.preventDefault();
			void this.commitSidebarReorder(fromId, toId);
		});
	}

	private async commitSidebarReorder(fromId: string, toId: string): Promise<void> {
		const from = this.tasks().find((t) => t.id === fromId);
		const to = this.tasks().find((t) => t.id === toId);
		if (!from || !to || from.type !== to.type) return;
		const type = from.type;
		if (!this.plugin.settings.sidebarOrder) {
			this.plugin.settings.sidebarOrder = { long: [], temp: [], bug: [] };
		}
		const ofType = this.tasks().filter((t) => t.type === type);
		const saved = this.plugin.settings.sidebarOrder[type] ?? [];
		const next = reorderSidebarIds(mergeSidebarOrder(ofType, saved), fromId, toId);
		this.plugin.settings.sidebarOrder[type] = next;
		await this.plugin.saveSettings();
		this.renderCatalog();
	}

	private async deleteTaskById(id: string): Promise<void> {
		const task = this.tasks().find((t) => t.id === id);
		if (!task) return;
		const ok = await askConfirm(
			this.app,
			"删除任务",
			`确定删除「${task.title}」？将删除笔记文件，此操作不可撤销。`,
			"删除",
		);
		if (!ok) return;
		const type = task.type;
		await this.plugin.store.deleteTask(task);
		if (this.plugin.settings.sidebarOrder?.[type]) {
			this.plugin.settings.sidebarOrder[type] = this.plugin.settings.sidebarOrder[type]
				.filter((x) => x !== id);
			await this.plugin.saveSettings();
		}
		if (this.selectedId === id) {
			const next = this.catalogFiltered()[0] ?? this.tasks()[0];
			this.selectedId = next?.id ?? "";
			this.editingLogDate = null;
			this.editingDesc = false;
			this.editingTitle = false;
			if (!this.selectedId) this.detailOpen = false;
		}
		this.renderAll();
		new Notice(`已删除：${task.title}`);
	}

	private applyBoardLayout(): void {
		const board = this.contentEl.querySelector("#ztk-view-board") as HTMLElement | null;
		if (!board || !board.classList.contains("on")) return;
		const split = 6;
		const w = board.clientWidth;
		const minLeft = 280;
		const minList = 320;
		const splitter = board.querySelector<HTMLElement>(".ztk-splitter");
		if (splitter) splitter.style.display = "";
		if (w <= 0) {
			board.style.gridTemplateColumns = `minmax(${minLeft}px, 0.38fr) ${split}px minmax(${minList}px, 1fr)`;
			return;
		}
		const avail = Math.max(1, w - split);
		let leftW = Math.round(avail * this.leftPaneRatio);
		leftW = Math.max(minLeft, Math.min(Math.floor(avail * 0.55), leftW));
		let listW = avail - leftW;
		if (listW < minList) {
			leftW = Math.max(minLeft, avail - minList);
			listW = avail - leftW;
		}
		board.style.gridTemplateColumns = `${leftW}px ${split}px ${listW}px`;
		this.leftPaneRatio = leftW / avail;
	}

	private bindBoardSplitters(): void {
		if (this.boardSplittersBound) return;
		const board = this.contentEl.querySelector("#ztk-view-board");
		if (!board) return;
		this.boardSplittersBound = true;
		board.querySelectorAll<HTMLElement>(".ztk-splitter").forEach((el) => {
			el.addEventListener("pointerdown", (ev) => {
				if (el.dataset.split !== "left-list") return;
				ev.preventDefault();
				const startX = ev.clientX;
				const startLeft = this.leftPaneRatio;
				this.contentEl.classList.add("is-resizing");
				el.classList.add("is-active");
				const onMove = (e: PointerEvent) => {
					const avail = Math.max(1, board.clientWidth - 6);
					const dRatio = (e.clientX - startX) / avail;
					this.leftPaneRatio = Math.min(0.55, Math.max(0.28, startLeft + dRatio));
					this.applyBoardLayout();
				};
				const onUp = () => {
					this.contentEl.classList.remove("is-resizing");
					el.classList.remove("is-active");
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
			});
		});
	}

	private openTaskDetail(id: string): void {
		if (this.selectedId !== id) {
			this.editingLogDate = null;
			this.editingDesc = false;
			this.editingTitle = false;
		}
		this.ypDrawerId = null;
		this.editingYpNoteIdx = null;
		this.projectMgrOpen = false;
		this.projectMgrRenameFrom = null;
		this.selectedId = id;
		this.detailOpen = true;
	}

	private closeDetailDrawer(): void {
		this.detailOpen = false;
		this.ypDrawerId = null;
		this.editingYpNoteIdx = null;
		this.projectMgrOpen = false;
		this.projectMgrRenameFrom = null;
		this.editingLogDate = null;
		this.editingDesc = false;
		this.editingTitle = false;
		this.syncDetailDrawer();
		this.renderBoardYesterday();
		this.renderCatalog();
	}

	private syncDetailDrawer(): void {
		const board = this.contentEl.querySelector("#ztk-view-board") as HTMLElement | null;
		if (!board) return;
		const open = this.detailOpen && (!!this.selectedId || !!this.ypDrawerId || this.projectMgrOpen);
		board.dataset.detailOpen = open ? "1" : "0";
		board.classList.toggle("is-detail-open", open);
		const drawer = board.querySelector(".ztk-detail-drawer");
		if (drawer) drawer.setAttribute("aria-hidden", open ? "false" : "true");
	}

	private syncPeriodVisibility(): void {
		this.$(".ztk-period").classList.toggle(
			"is-hidden",
			this.view === "board"
				|| this.view === "detail"
				|| this.view === "cal"
				|| this.view === "web",
		);
		const newBtn = this.contentEl.querySelector<HTMLElement>("[data-act=\"new\"]");
		if (newBtn) {
			newBtn.classList.toggle("is-hidden", this.view !== "board");
		}
		const pmBtn = this.contentEl.querySelector<HTMLElement>("[data-act=\"project-mgr\"]");
		if (pmBtn) {
			pmBtn.classList.toggle("is-hidden", this.view !== "board");
		}
	}

	private async openModal(): Promise<void> {
		await this.plugin.store.refreshProjectList();
		this.syncProjectFilterOptions();
		const form = this.$(".ztk-modal-card") as HTMLFormElement;
		const start = form.elements.namedItem("start") as HTMLInputElement;
		const end = form.elements.namedItem("end") as HTMLInputElement;
		start.value = todayStr();
		end.value = fmt(addDays(new Date(), 14));
		const projectSelect = form.elements.namedItem("project") as HTMLSelectElement;
		const projects = this.plugin.store.projects;
		if (!projects.length) {
			new Notice("请先在「项目管理」中新增项目");
			return;
		}
		const preferred = resolveNewTaskProject(this.projectFilter, projects);
		projectSelect.innerHTML = projects
			.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`)
			.join("");
		projectSelect.value = resolveProjectSelectValue(preferred, projects);
		this.$(".ztk-modal").classList.add("on");
	}

	private closeModal(): void {
		this.$(".ztk-modal").classList.remove("on");
	}

	private async openProjectMgrDrawer(): Promise<void> {
		this.closeModal();
		await this.plugin.store.refreshProjectList();
		this.selectedId = "";
		this.ypDrawerId = null;
		this.editingYpNoteIdx = null;
		this.projectMgrRenameFrom = null;
		this.projectMgrOpen = true;
		this.detailOpen = true;
		this.syncDetailDrawer();
		this.renderDetail();
		this.renderCatalog();
	}

	private async pmAddProject(): Promise<void> {
		const input = this.contentEl.querySelector<HTMLInputElement>(".ztk-pm-add-input");
		const raw = input?.value ?? "";
		if (!normalizeProjectName(raw)) {
			new Notice("请填写有效项目名（不能是日报/长期/临时/缺陷）");
			input?.focus();
			return;
		}
		const result = await this.plugin.store.createProject(raw);
		if (!result.ok) {
			new Notice(result.reason);
			return;
		}
		if (input) input.value = "";
		this.syncProjectFilterOptions();
		this.renderDetail();
		new Notice(`已创建项目「${result.name}」`);
	}

	private async pmRenameProject(from: string): Promise<void> {
		const input = Array.from(
			this.contentEl.querySelectorAll<HTMLInputElement>(".ztk-pm-rename-input"),
		).find((el) => el.dataset.project === from);
		const raw = input?.value ?? "";
		const result = await this.plugin.store.renameProject(from, raw);
		if (!result.ok) {
			new Notice(result.reason);
			return;
		}
		const root = this.plugin.store.root();
		const order = this.plugin.settings.sidebarOrder;
		if (order) {
			order.long = remapPathsAfterProjectRename(order.long ?? [], root, result.from, result.to);
			order.temp = remapPathsAfterProjectRename(order.temp ?? [], root, result.from, result.to);
			order.bug = remapPathsAfterProjectRename(order.bug ?? [], root, result.from, result.to);
			await this.plugin.saveSettings();
		}
		if (this.projectFilter === result.from) this.projectFilter = result.to;
		if (this.selectedId) {
			const prefix = `${root}/${result.from}/`;
			if (this.selectedId.startsWith(prefix)) {
				this.selectedId = `${root}/${result.to}/${this.selectedId.slice(prefix.length)}`;
			}
		}
		this.projectMgrRenameFrom = null;
		this.projectMgrOpen = true;
		this.detailOpen = true;
		this.syncProjectFilterOptions();
		this.renderAll();
		new Notice(`已重命名为「${result.to}」`);
	}

	private async pmDeleteProject(name: string): Promise<void> {
		if (this.plugin.store.tasks.some((t) => t.project === name)) {
			new Notice(`「${name}」下还有任务，请先迁移或删除任务后再删项目`);
			return;
		}
		const ok = await askConfirm(
			this.app,
			"删除项目",
			`确定删除空项目「${name}」？将删除其目录与占位文件，此操作不可恢复。`,
			"删除",
		);
		if (!ok) return;
		const result = await this.plugin.store.deleteProject(name);
		if (!result.ok) {
			new Notice(result.reason);
			return;
		}
		if (this.projectFilter === name) this.projectFilter = "all";
		this.projectMgrOpen = true;
		this.detailOpen = true;
		this.syncProjectFilterOptions();
		this.renderAll();
		new Notice(`已删除项目「${name}」`);
	}

	private async createTask(form: HTMLFormElement): Promise<void> {
		const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
		const desc = (form.elements.namedItem("desc") as HTMLTextAreaElement).value.trim();
		const project = (form.elements.namedItem("project") as HTMLSelectElement).value.trim();
		if (!project || !this.plugin.store.projects.includes(project)) {
			new Notice("请选择有效业务项目");
			return;
		}
		const type = (form.elements.namedItem("type") as HTMLSelectElement).value as TaskType;
		const status = (form.elements.namedItem("status") as HTMLSelectElement).value as TaskStatus;
		const start = (form.elements.namedItem("start") as HTMLInputElement).value;
		const end = (form.elements.namedItem("end") as HTMLInputElement).value;
		const task = await this.plugin.store.create({ title, desc, project, type, status, start, end });
		this.openTaskDetail(task.id);
		this.switchView("board");
		this.closeModal();
		form.reset();
		this.renderAll();
		new Notice(`已创建笔记 ${task.path}`);
	}

	private async addTodayLog(): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		const textEl = this.contentEl.querySelector("#ztk-log-text") as HTMLTextAreaElement | null;
		const hoursEl = this.contentEl.querySelector("#ztk-log-hours") as HTMLInputElement | null;
		const text = textEl?.value.trim();
		const hoursRaw = hoursEl?.value ?? "";
		const hours = parseHoursInput(hoursRaw);
		if (!t || !text) {
			new Notice("请填写进展内容");
			this.restoreInputFocus(textEl ?? hoursEl);
			return;
		}
		if (hours === null) {
			new Notice("请填写有效工时（小时，须大于 0）");
			this.restoreInputFocus(hoursEl);
			return;
		}
		this.selectedId = await this.plugin.store.addLog(t, todayStr(), text, hours);
		this.renderAll();
		new Notice("已写入今日进展");
		this.restoreInputFocus(this.contentEl.querySelector("#ztk-log-text") as HTMLTextAreaElement | null);
	}

	/** Notice 后恢复可编辑焦点，避免 Electron 吃掉键盘输入 */
	private restoreInputFocus(el: HTMLElement | null | undefined): void {
		const win = this.contentEl.ownerDocument.defaultView;
		requestAnimationFrame(() => {
			win?.focus();
			el?.focus({ preventScroll: true });
		});
	}

	private async changeStatus(status: TaskStatus): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t || t.status === status) return;
		this.selectedId = await this.plugin.store.setStatus(t, status);
		this.renderAll();
		new Notice(`状态已改为「${STATUS_LABEL[status]}」`);
		this.restoreInputFocus(this.contentEl.querySelector("#ztk-log-text") as HTMLTextAreaElement | null);
	}

	private async changeType(type: TaskType): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t || t.type === type) return;
		this.selectedId = await this.plugin.store.setType(t, type);
		this.renderAll();
		new Notice(`类型已改为「${TYPE_LABEL[type]}」`);
		this.restoreInputFocus(this.contentEl.querySelector("#ztk-log-text") as HTMLTextAreaElement | null);
	}

	private async changeProject(raw: string): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		const next = raw.trim() || DEFAULT_PROJECT;
		if (!t || t.project === next) return;
		this.selectedId = await this.plugin.store.setProject(t, next);
		this.renderAll();
		new Notice(`项目已改为「${next}」`);
		this.restoreInputFocus(this.contentEl.querySelector("#ztk-log-text") as HTMLTextAreaElement | null);
	}

	private async handleTitleAction(act: string): Promise<void> {
		if (this.ypDrawerId) {
			await this.handleYpTitleAction(act);
			return;
		}
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t) return;
		if (act === "edit-title") {
			this.editingTitle = true;
			this.rerenderDetail();
			(this.contentEl.querySelector("#ztk-title-input") as HTMLInputElement | null)?.focus();
			return;
		}
		if (act === "cancel-title") {
			this.editingTitle = false;
			this.rerenderDetail();
			return;
		}
		if (act === "save-title") {
			const box = this.contentEl.querySelector("#ztk-title-input") as HTMLInputElement | null;
			const title = box?.value.trim() ?? "";
			if (!title) {
				new Notice("标题不能为空");
				return;
			}
			this.selectedId = await this.plugin.store.setTitle(t, title);
			this.editingTitle = false;
			this.renderAll();
			new Notice("已更新标题");
		}
	}

	private async handleYpTitleAction(act: string): Promise<void> {
		if (act === "edit-title") {
			this.editingTitle = true;
			this.rerenderDetail();
			(this.contentEl.querySelector("#ztk-title-input") as HTMLInputElement | null)?.focus();
			return;
		}
		if (act === "cancel-title") {
			if (this.ypDrawerId === YP_DRAWER_NEW) {
				const box = this.contentEl.querySelector("#ztk-title-input") as HTMLInputElement | null;
				if (!(box?.value.trim())) {
					this.closeDetailDrawer();
					return;
				}
			}
			this.editingTitle = false;
			this.rerenderDetail();
			return;
		}
		if (act === "save-title") {
			const box = this.contentEl.querySelector("#ztk-title-input") as HTMLInputElement | null;
			const title = box?.value.trim() ?? "";
			if (!title) {
				new Notice("标题不能为空");
				return;
			}
			const projectEl = this.contentEl.querySelector<HTMLSelectElement>(".ztk-yp-project");
			const project = projectEl?.value.trim() || YP_NO_PROJECT;
			const desc = this.readYpDescValue();
			const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
			if (this.ypDrawerId === YP_DRAWER_NEW) {
				const id = newYesterdayPlanItemId();
				const item: YesterdayPlanItem = { id, title, project, desc, notes: [], done: false };
				await this.persistYesterdayPlan([...this.ypActiveCache().items, item], baseline);
				this.ypDrawerId = id;
			} else {
				const items = this.ypActiveCache().items.map((it) =>
					it.id === this.ypDrawerId ? { ...it, title, project, desc } : it,
				);
				await this.persistYesterdayPlan(items, baseline);
			}
			this.editingTitle = false;
			this.rerenderDetail();
			this.renderBoardYesterday();
			new Notice("已更新标题");
		}
	}

	private async copyToClipboard(text: string, okMsg = "已复制"): Promise<void> {
		const ok = await copyText(text);
		new Notice(ok ? okMsg : "复制失败");
	}

	private async copyReportLogs(): Promise<void> {
		const logs = this.logsInPeriod()
			.sort((a, b) => b.date.localeCompare(a.date))
			.map((l) => ({
				date: l.date,
				title: l.task.title,
				path: l.task.path,
				text: l.text,
				hours: l.hours,
			}));
		const text = formatReportLogsCopyText(logs, this.reportByTask);
		if (!text) {
			new Notice("这个周期还没有记录");
			return;
		}
		await this.copyToClipboard(text, "已复制进展明细");
	}

	private resolveSourceText(path: string, date: string, kind: string): string {
		const task = this.tasks().find((t) => t.path === path);
		if (!task) return "";
		if (kind === "desc" || (!date && kind !== "log")) return task.desc;
		return task.logs.find((l) => l.date === date)?.text ?? "";
	}

	private textNear(el: HTMLElement | null): string {
		if (!el) return "";
		const md = el.closest<HTMLElement>(".ztk-md");
		if (md) {
			const fromStore = this.resolveSourceText(md.dataset.src ?? "", md.dataset.date ?? "", md.dataset.kind ?? "log");
			if (fromStore.trim()) return fromStore;
			return md.innerText || "";
		}
		const log = el.closest<HTMLElement>(".ztk-log");
		if (log?.dataset.date) {
			const t = this.tasks().find((x) => x.id === this.selectedId);
			const text = t?.logs.find((l) => l.date === log.dataset.date)?.text;
			if (text?.trim()) return text;
			return log.innerText || "";
		}
		const desc = el.closest<HTMLElement>(".ztk-desc");
		if (desc) {
			if (this.ypDrawerId) {
				const text = this.readYpDescValue();
				if (text.trim()) return text;
				return desc.innerText || "";
			}
			const t = this.tasks().find((x) => x.id === this.selectedId);
			if (t?.desc?.trim()) return t.desc;
			return desc.innerText || "";
		}
		const today = el.closest<HTMLElement>(".ztk-today-item");
		if (today) {
			return this.resolveSourceText(today.dataset.path ?? "", today.dataset.date ?? "", "log")
				|| today.innerText || "";
		}
		const cell = el.closest<HTMLElement>("td");
		if (cell) {
			const slot = cell.querySelector<HTMLElement>(".ztk-md");
			if (slot) {
				return this.resolveSourceText(slot.dataset.src ?? "", slot.dataset.date ?? "", slot.dataset.kind ?? "log")
					|| slot.innerText || "";
			}
		}
		return "";
	}

	private openCopyMenu(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (target.closest("textarea, input, select, button")) return;

		const titleEl = target.closest<HTMLElement>(".ztk-detail-title");
		if (titleEl) {
			e.preventDefault();
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle("修改标题")
					.setIcon("pencil")
					.onClick(() => {
						void this.handleTitleAction("edit-title");
					});
			});
			const title = titleEl.textContent?.trim() ?? "";
			if (title) {
				menu.addItem((item) => {
					item.setTitle("复制标题")
						.setIcon("copy")
						.onClick(() => {
							void this.copyToClipboard(title);
						});
				});
			}
			menu.showAtMouseEvent(e);
			return;
		}

		const selected = window.getSelection()?.toString() ?? "";
		const block = this.textNear(target);
		if (!selected.trim() && !block.trim()) return;
		e.preventDefault();
		const menu = new Menu();
		if (selected.trim()) {
			menu.addItem((item) => {
				item.setTitle("复制选中内容")
					.setIcon("copy")
					.onClick(() => {
						void this.copyToClipboard(selected);
					});
			});
		}
		if (block.trim() && block.trim() !== selected.trim()) {
			menu.addItem((item) => {
				item.setTitle("复制本段")
					.setIcon("clipboard-copy")
					.onClick(() => {
						void this.copyToClipboard(block);
					});
			});
		} else if (block.trim() && !selected.trim()) {
			menu.addItem((item) => {
				item.setTitle("复制本段")
					.setIcon("clipboard-copy")
					.onClick(() => {
						void this.copyToClipboard(block);
					});
			});
		}
		menu.showAtMouseEvent(e);
	}

	private async copyDesc(): Promise<void> {
		if (this.ypDrawerId) {
			const desc = this.readYpDescValue();
			if (!desc.trim()) {
				new Notice("没有可复制的说明");
				return;
			}
			await this.copyToClipboard(desc);
			return;
		}
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t?.desc.trim()) {
			new Notice("没有可复制的说明");
			return;
		}
		await this.copyToClipboard(t.desc);
	}

	private async copyLog(date: string): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		const text = t?.logs.find((l) => l.date === date)?.text ?? "";
		if (!text.trim()) {
			new Notice("没有可复制的进展");
			return;
		}
		await this.copyToClipboard(text);
	}

	private async copyByPathDate(path: string, date: string): Promise<void> {
		const text = this.resolveSourceText(path, date, "log");
		if (!text.trim()) {
			new Notice("没有可复制的内容");
			return;
		}
		await this.copyToClipboard(text);
	}

	private async handleDescAction(act: string): Promise<void> {
		if (this.ypDrawerId) {
			await this.handleYpDescAction(act);
			return;
		}
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t) return;
		if (act === "edit-desc") {
			this.editingDesc = true;
			this.rerenderDetail();
			(this.contentEl.querySelector("#ztk-desc-text") as HTMLTextAreaElement | null)?.focus();
			return;
		}
		if (act === "cancel-desc") {
			this.editingDesc = false;
			this.rerenderDetail();
			return;
		}
		if (act === "save-desc") {
			const box = this.contentEl.querySelector("#ztk-desc-text") as HTMLTextAreaElement | null;
			const desc = box?.value.trim() ?? "";
			this.selectedId = await this.plugin.store.setDesc(t, desc);
			this.editingDesc = false;
			this.renderAll();
			new Notice("已更新说明");
		}
	}

	private async handleYpDescAction(act: string): Promise<void> {
		if (act === "edit-desc") {
			this.editingDesc = true;
			this.rerenderDetail();
			(this.contentEl.querySelector("#ztk-desc-text") as HTMLTextAreaElement | null)?.focus();
			return;
		}
		if (act === "cancel-desc") {
			this.editingDesc = false;
			this.rerenderDetail();
			return;
		}
		if (act === "save-desc") {
			const box = this.contentEl.querySelector("#ztk-desc-text") as HTMLTextAreaElement | null;
			const desc = box?.value.trim() ?? "";
			if (this.ypDrawerId === YP_DRAWER_NEW) {
				const fields = this.readYpDrawerFields();
				fields.desc = desc;
				if (!fields.title) {
					new Notice("请先填写标题");
					this.editingTitle = true;
					this.rerenderDetail();
					this.contentEl.querySelector<HTMLInputElement>("#ztk-title-input")?.focus();
					return;
				}
				const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
				const id = newYesterdayPlanItemId();
				await this.persistYesterdayPlan(
					[...this.ypActiveCache().items, { id, ...fields, notes: [], done: false }],
					baseline,
				);
				this.ypDrawerId = id;
			} else {
				const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
				const items = this.ypActiveCache().items.map((it) =>
					it.id === this.ypDrawerId ? { ...it, desc } : it,
				);
				await this.persistYesterdayPlan(items, baseline);
			}
			this.editingDesc = false;
			this.rerenderDetail();
			this.renderBoardYesterday();
			new Notice("已更新说明");
		}
	}

	private async handleLogAction(act: string, date: string): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t) return;
		if (act === "edit-log") {
			this.editingLogDate = date;
			this.rerenderDetail();
			return;
		}
		if (act === "cancel-log") {
			this.editingLogDate = null;
			this.rerenderDetail();
			return;
		}
		if (act === "save-log") {
			const row = this.contentEl.querySelector(`.ztk-log[data-date="${CSS.escape(date)}"]`);
			const textEl = row?.querySelector("textarea") as HTMLTextAreaElement | null;
			const hoursEl = row?.querySelector(".ztk-log-hours-edit") as HTMLInputElement | null;
			const dateEl = row?.querySelector(".ztk-log-date-edit") as HTMLInputElement | null;
			const taskEl = row?.querySelector(".ztk-log-task-edit") as HTMLSelectElement | null;
			const text = textEl?.value.trim() ?? "";
			const hoursRaw = hoursEl?.value ?? "";
			const hours = parseHoursInput(hoursRaw);
			const nextDate = (dateEl?.value ?? date).trim();
			const targetId = taskEl?.value || t.id;
			const target = this.tasks().find((x) => x.id === targetId) ?? t;
			if (!text) {
				new Notice("进展内容不能为空");
				this.restoreInputFocus(textEl);
				return;
			}
			if (hours === null) {
				new Notice("请填写有效工时（小时，须大于 0）");
				this.restoreInputFocus(hoursEl);
				return;
			}
			if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
				new Notice("请填写有效日期");
				this.restoreInputFocus(dateEl);
				return;
			}
			this.selectedId = await this.plugin.store.saveLogEdit(
				t,
				date,
				{ date: nextDate, text, hours: hours ?? 0 },
				target,
			);
			this.detailOpen = true;
			this.editingLogDate = null;
			this.renderAll();
			new Notice(
				target.id === t.id && nextDate === date
					? "已更新进展"
					: `已保存到「${target.project} · ${target.title}」· ${nextDate}`,
			);
			return;
		}
		if (act === "del-log") {
			const ok = await askConfirm(this.app, "删除进展", `确定删除 ${date} 这条进展？`, "删除");
			if (!ok) return;
			this.selectedId = await this.plugin.store.deleteLog(t, date);
			if (this.editingLogDate === date) this.editingLogDate = null;
			this.renderAll();
			new Notice("已删除进展");
		}
	}

	renderAll(): void {
		this.mdGen += 1;
		const gen = this.mdGen;
		const topTab = this.topTabFor(this.view);
		this.contentEl.querySelectorAll(".ztk-tabs button").forEach((b) =>
			b.classList.toggle("on", (b as HTMLElement).dataset.tab === topTab));
		const pageId = this.pageIdFor(this.view);
		for (const v of VIEWS) {
			const page = this.contentEl.querySelector(`#ztk-view-${v}`);
			if (!page) continue;
			page.classList.toggle("on", v === pageId);
		}
		this.syncPeriodVisibility();
		this.syncPeriodControls();
		this.syncProjectFilterOptions();
		this.syncWorkShell();
		this.syncDetailDrawer();
		this.renderDetail();
		this.renderCalendar();
		this.renderGantt();
		this.renderReport();
		requestAnimationFrame(() => this.applyBoardLayout());
		void this.paintMarkdown(gen);
	}

	private mdSlot(path: string, date: string): string {
		return mdSlotHtml(path, date);
	}

	private rerenderDetail(): void {
		this.mdGen += 1;
		const gen = this.mdGen;
		this.renderDetail();
		void this.paintMarkdown(gen);
	}

	private async paintMarkdown(gen: number): Promise<void> {
		if (gen !== this.mdGen) return;
		this.mdRoot.unload();
		if (gen !== this.mdGen) return;
		this.mdRoot = new Component();
		this.mdRoot.load();
		const boxes: HTMLElement[] = [];
		this.contentEl.querySelectorAll(".ztk-md").forEach((el) => boxes.push(el as HTMLElement));
		for (const box of boxes) {
			if (gen !== this.mdGen) return;
			const path = box.dataset.src ?? "";
			const date = box.dataset.date ?? "";
			const task = this.tasks().find((t) => t.path === path);
			const text = box.dataset.kind === "desc"
				? (task?.desc ?? "")
				: (task?.logs.find((l) => l.date === date)?.text ?? "");
			box.empty();
			await MarkdownRenderer.render(this.app, text, box, path, this.mdRoot);
		}
		if (gen === this.mdGen) this.applyReportHighlight();
	}

	private applyReportHighlight(): void {
		const list = this.contentEl.querySelector<HTMLElement>(".ztk-report-list");
		if (!list) return;
		highlightElementText(list, this.reportQuery);
	}

	private syncWorkShell(): void {
		const board = this.contentEl.querySelector("#ztk-view-board") as HTMLElement | null;
		if (!board) return;
		this.renderBoardYesterday();
		this.renderBoardToday();
		this.renderBoardPlan();
		this.renderFilters();
		this.renderCatalog();
	}

	/** 工作台最左：昨日计划 = 昨天日报「明日计划」（日期仅在批量新增弹窗选择） */
	private renderBoardYesterday(show = true): void {
		const box = this.contentEl.querySelector<HTMLElement>(".ztk-board-yesterday");
		if (!box) return;
		if (!show) {
			box.innerHTML = "";
			box.classList.remove("is-collapsed");
			return;
		}
		const reportDate = this.boardYpReportDate();
		if (this.boardPlanCache.reportDate !== reportDate) {
			void this.refreshBoardPlanCache();
		}
		const collapsed = this.boardCollapsed.yesterday;
		box.classList.toggle("is-collapsed", collapsed);
		box.innerHTML = yesterdayPlanBlockHtml({
			items: this.boardPlanCache.items,
			selectedId: this.ypDrawerId && this.ypDrawerId !== YP_DRAWER_NEW ? this.ypDrawerId : null,
			collapsed,
			planDay: this.boardYpPlanDay(),
		});
	}

	private ypActiveCache(): {
		path: string | null;
		items: YesterdayPlanItem[];
		baseline: YesterdayPlanItem[];
		reportDate: string;
	} {
		const r = this.ypEditReportDate || this.boardPlanCache.reportDate;
		if (r && this.calPlanCache.reportDate === r && this.boardPlanCache.reportDate === r) {
			return this.view === "cal" ? this.calPlanCache : this.boardPlanCache;
		}
		if (r && this.calPlanCache.reportDate === r) return this.calPlanCache;
		return this.boardPlanCache;
	}

	private async refreshBoardPlanCache(): Promise<void> {
		const reportDate = this.boardYpReportDate();
		try {
			const data = await this.plugin.store.readYesterdayPlan(reportDate);
			this.boardPlanCache = {
				path: data.path,
				items: data.items,
				baseline: data.baseline,
				reportDate: data.reportDate,
			};
		} catch {
			this.boardPlanCache = { path: null, items: [], baseline: [], reportDate };
		}
		if (this.contentEl.querySelector(".ztk-board-yesterday")) {
			this.renderBoardYesterday();
		}
	}

	private async refreshCalPlanCache(): Promise<void> {
		const reportDate = planReportDateForDay(this.selectedDay);
		try {
			const data = await this.plugin.store.readYesterdayPlan(reportDate);
			this.calPlanCache = {
				path: data.path,
				items: data.items,
				baseline: data.baseline,
				reportDate: data.reportDate,
			};
		} catch {
			this.calPlanCache = { path: null, items: [], baseline: [], reportDate };
		}
	}

	private async persistYesterdayPlan(
		items: YesterdayPlanItem[],
		baseline: YesterdayPlanItem[],
		reportDate?: string,
	): Promise<void> {
		const date = (reportDate?.trim()
			|| this.ypEditReportDate
			|| this.boardPlanCache.reportDate
			|| this.boardYpReportDate());
		try {
			const path = await this.plugin.store.writeYesterdayPlan(items, baseline, date);
			const next = {
				path,
				items: items.map((it) => ({ ...it })),
				baseline: baseline.map((it) => ({ ...it })),
				reportDate: date,
			};
			if (this.boardPlanCache.reportDate === date || !this.boardPlanCache.reportDate) {
				this.boardPlanCache = next;
			}
			if (this.calPlanCache.reportDate === date) {
				this.calPlanCache = next;
			}
			this.renderBoardYesterday();
			if (this.view === "cal") this.renderCalendar();
		} catch {
			new Notice("保存计划失败");
		}
	}

	private async openYpDrawer(id: string | null, reportDate?: string): Promise<void> {
		this.editingLogDate = null;
		this.editingYpNoteIdx = null;
		this.editingDesc = false;
		this.editingTitle = false;
		this.selectedId = "";
		this.projectMgrOpen = false;
		this.projectMgrRenameFrom = null;
		this.ypEditReportDate = (reportDate?.trim()
			|| (this.view === "cal" ? planReportDateForDay(this.selectedDay) : this.boardYpReportDate()));
		if (this.view === "cal" && this.calPlanCache.reportDate !== this.ypEditReportDate) {
			await this.refreshCalPlanCache();
		}
		if (this.view !== "cal" && this.boardPlanCache.reportDate !== this.ypEditReportDate) {
			await this.refreshBoardPlanCache();
		}
		if (!id) {
			this.ypDrawerId = YP_DRAWER_NEW;
			this.editingTitle = true;
		} else {
			const item = this.ypActiveCache().items.find((it) => it.id === id);
			if (!item) return;
			this.ypDrawerId = id;
			this.editingTitle = false;
		}
		this.detailOpen = true;
		this.syncDetailDrawer();
		this.renderDetail();
		this.renderBoardYesterday();
		if (this.view === "cal") this.renderCalendar();

		requestAnimationFrame(() => {
			this.contentEl.querySelector<HTMLInputElement>("#ztk-title-input")?.focus();
		});
	}

	/** 工作台中间上：复用汇总页「我的今天」卡片 */
	private renderBoardToday(show = true): void {
		const box = this.contentEl.querySelector<HTMLElement>(".ztk-board-today");
		if (!box) return;
		if (!show) {
			box.innerHTML = "";
			box.classList.remove("is-collapsed");
			return;
		}
		const today = todayStr();
		const todayLogs = this.logsOn(today, "all");
		const collapsed = this.boardCollapsed.today;
		box.classList.toggle("is-collapsed", collapsed);
		box.innerHTML = todayDigestHtml(
			today,
			todayLogs.map((l) => ({
				id: l.task.id,
				title: l.task.title,
				path: l.task.path,
				project: l.task.project,
				hours: l.hours,
			})),
			{
				groupByProject: this.plugin.settings.todayGroupByProject === true,
				collapsible: true,
				collapsed,
			},
		);
	}

	/** 工作台中间下：明日计划待办 */
	private renderBoardPlan(show = true): void {
		const box = this.contentEl.querySelector<HTMLElement>(".ztk-board-plan");
		if (!box) return;
		if (!show) {
			box.innerHTML = "";
			box.classList.remove("is-collapsed");
			return;
		}
		const draft = this.syncDailyReportDraft();
		const collapsed = this.boardCollapsed.plan;
		box.classList.toggle("is-collapsed", collapsed);
		box.innerHTML = `
			<div class="ztk-card ztk-tomorrow-plan${collapsed ? " is-collapsed" : ""}">
				<div class="ztk-tomorrow-plan-head">
					<div class="ztk-section-title">
						<button type="button" class="ztk-ghost ztk-section-collapse" data-act="toggle-board-section" data-section="plan" title="${collapsed ? "展开" : "折叠"}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "展开" : "折叠"}">${collapsed ? "▸" : "▾"}</button>
						<h2>明日计划</h2>
					</div>
				</div>
				<div class="ztk-collapsible-body">
					${tomorrowPlanListHtml(draft.planItems)}
				</div>
			</div>
		`;
	}

	private readYpDescValue(): string {
		if (this.editingDesc) {
			const box = this.contentEl.querySelector<HTMLTextAreaElement>("#ztk-desc-text");
			if (box) return box.value.trim();
		}
		if (this.ypDrawerId && this.ypDrawerId !== YP_DRAWER_NEW) {
			return this.ypActiveCache().items.find((it) => it.id === this.ypDrawerId)?.desc.trim() ?? "";
		}
		return "";
	}

	private readYpDrawerFields(): { title: string; project: string; desc: string } {
		const titleInput = this.contentEl.querySelector<HTMLInputElement>("#ztk-title-input");
		const titleEl = this.contentEl.querySelector<HTMLElement>(".ztk-detail-title");
		const fromCache = this.ypDrawerId && this.ypDrawerId !== YP_DRAWER_NEW
			? this.ypActiveCache().items.find((it) => it.id === this.ypDrawerId)?.title ?? ""
			: "";
		const title = (titleInput?.value ?? titleEl?.textContent ?? fromCache).trim();
		const project = this.contentEl.querySelector<HTMLSelectElement>(".ztk-yp-project")?.value.trim()
			|| YP_NO_PROJECT;
		return { title, project, desc: this.readYpDescValue() };
	}

	private async ypDrawerSaveFields(opts?: { quiet?: boolean }): Promise<boolean> {
		if (!this.ypDrawerId) return false;
		const fields = this.readYpDrawerFields();
		if (!fields.title) {
			if (!opts?.quiet) {
				new Notice("请填写标题");
				this.editingTitle = true;
				this.rerenderDetail();
				this.contentEl.querySelector<HTMLInputElement>("#ztk-title-input")?.focus();
			}
			return false;
		}
		const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
		if (this.ypDrawerId === YP_DRAWER_NEW) {
			const id = newYesterdayPlanItemId();
			const item: YesterdayPlanItem = { id, ...fields, notes: [], done: false };
			await this.persistYesterdayPlan([...this.ypActiveCache().items, item], baseline);
			this.ypDrawerId = id;
			if (!opts?.quiet) new Notice("已新增昨日计划");
		} else {
			const cur = this.ypActiveCache().items.find((it) => it.id === this.ypDrawerId);
			if (
				cur
				&& cur.title === fields.title
				&& cur.project === fields.project
				&& cur.desc === fields.desc
			) {
				return false;
			}
			const items = this.ypActiveCache().items.map((it) =>
				it.id === this.ypDrawerId ? { ...it, ...fields } : it,
			);
			await this.persistYesterdayPlan(items, baseline);
			if (!opts?.quiet) new Notice("已保存");
		}
		this.rerenderDetail();
		this.renderBoardYesterday();
		return true;
	}

	private async ypDrawerAddLog(): Promise<void> {
		if (!this.ypDrawerId) return;
		const text = this.contentEl.querySelector<HTMLTextAreaElement>("#ztk-yp-log-text")?.value.trim() ?? "";
		if (!text) {
			new Notice("请填写进展内容");
			this.contentEl.querySelector<HTMLTextAreaElement>("#ztk-yp-log-text")?.focus();
			return;
		}
		if (this.ypDrawerId === YP_DRAWER_NEW) {
			const ok = await this.ypDrawerSaveFields();
			if (!ok && this.ypDrawerId === YP_DRAWER_NEW) return;
		}
		const itemId = this.ypDrawerId;
		if (!itemId || itemId === YP_DRAWER_NEW) {
			new Notice("请先填写标题并保存");
			return;
		}
		const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
		const items = this.ypActiveCache().items.map((it) => {
			if (it.id !== itemId) return it;
			return {
				...it,
				notes: [...(it.notes ?? []), { date: todayStr(), text }],
			};
		});
		await this.persistYesterdayPlan(items, baseline);
		this.editingYpNoteIdx = null;
		this.rerenderDetail();
		this.renderBoardYesterday();
		new Notice("已记一笔");
		requestAnimationFrame(() => {
			const el = this.contentEl.querySelector<HTMLTextAreaElement>("#ztk-yp-log-text");
			if (el) el.value = "";
			this.restoreInputFocus(el);
		});
	}

	private async copyYpNote(idx: number): Promise<void> {
		const item = this.ypActiveCache().items.find((it) => it.id === this.ypDrawerId);
		const note = item?.notes?.[idx];
		if (!note) return;
		await this.copyToClipboard(note.text);
	}

	private async handleYpNoteAction(act: string, idx: number): Promise<void> {
		const item = this.ypActiveCache().items.find((it) => it.id === this.ypDrawerId);
		if (!item) return;
		const notes = [...(item.notes ?? [])];
		if (idx < 0 || idx >= notes.length) return;
		if (act === "edit-log") {
			this.editingYpNoteIdx = idx;
			this.rerenderDetail();
			return;
		}
		if (act === "cancel-log") {
			this.editingYpNoteIdx = null;
			this.rerenderDetail();
			return;
		}
		if (act === "save-log") {
			const row = this.contentEl.querySelector(`.ztk-log[data-yp-note-idx="${idx}"]`);
			const textEl = row?.querySelector("textarea") as HTMLTextAreaElement | null;
			const dateEl = row?.querySelector(".ztk-log-date-edit") as HTMLInputElement | null;
			const text = textEl?.value.trim() ?? "";
			const nextDate = (dateEl?.value ?? notes[idx]!.date).trim();
			if (!text) {
				new Notice("进展内容不能为空");
				this.restoreInputFocus(textEl);
				return;
			}
			if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
				new Notice("请填写有效日期");
				this.restoreInputFocus(dateEl);
				return;
			}
			notes[idx] = { date: nextDate, text };
			const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
			const items = this.ypActiveCache().items.map((it) =>
				it.id === item.id ? { ...it, notes } : it,
			);
			await this.persistYesterdayPlan(items, baseline);
			this.editingYpNoteIdx = null;
			this.rerenderDetail();
			this.renderBoardYesterday();
			new Notice("已更新进展");
			return;
		}
		if (act === "del-log") {
			const ok = await askConfirm(
				this.app,
				"删除进展",
				`确定删除 ${notes[idx]!.date} 这条进展？`,
				"删除",
			);
			if (!ok) return;
			notes.splice(idx, 1);
			const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
			const items = this.ypActiveCache().items.map((it) =>
				it.id === item.id ? { ...it, notes } : it,
			);
			await this.persistYesterdayPlan(items, baseline);
			if (this.editingYpNoteIdx === idx) this.editingYpNoteIdx = null;
			this.rerenderDetail();
			this.renderBoardYesterday();
			new Notice("已删除进展");
		}
	}

	private ypNoteRowHtml(note: { date: string; text: string }, idx: number): string {
		if (this.editingYpNoteIdx === idx) {
			return `<div class="ztk-log is-editing" data-yp-note-idx="${idx}" data-date="${esc(note.date)}">
				<div class="ztk-log-when"><time>${esc(note.date)}</time></div>
				<div class="ztk-log-body">
					<div class="ztk-log-edit-meta">
						<label class="ztk-log-field">日期
							<input class="ztk-log-date-edit" type="date" value="${esc(note.date)}" />
						</label>
					</div>
					<textarea class="ztk-log-edit">${esc(note.text)}</textarea>
				</div>
				<div class="ztk-log-actions">
					${iconBtn("save-log", "save", "保存")}
					${iconBtn("cancel-log", "cancel", "取消")}
				</div>
			</div>`;
		}
		const body = esc(note.text).replace(/\n/g, "<br>");
		return `<div class="ztk-log" data-yp-note-idx="${idx}" data-date="${esc(note.date)}">
			<div class="ztk-log-when"><time>${esc(note.date)}</time></div>
			<div class="ztk-log-body">${body}</div>
			<div class="ztk-log-actions">
				${iconBtn("copy-log", "copy", "复制")}
				${iconBtn("edit-log", "edit", "编辑")}
				${iconBtn("del-log", "del", "删除")}
			</div>
		</div>`;
	}

	private async deleteYesterdayPlanItem(id: string): Promise<void> {
		const cur = this.ypActiveCache().items.find((it) => it.id === id);
		if (!cur) return;
		const ok = await askConfirm(
			this.app,
			"删除昨日计划",
			`确定删除「${cur.title}」？`,
			"删除",
		);
		if (!ok) return;
		const items = this.ypActiveCache().items.filter((it) => it.id !== id);
		await this.persistYesterdayPlan(
			items,
			this.ypActiveCache().baseline.map((it) => ({ ...it })),
		);
		if (this.ypDrawerId === id) this.closeDetailDrawer();
		new Notice("已删除昨日计划");
	}

	private async resetYesterdayPlan(): Promise<void> {
		const ok = await askConfirm(
			this.app,
			"重置昨日计划",
			"将恢复为根据昨日日报「明日计划」生成的内容，当前增删改会丢失。",
			"重置",
		);
		if (!ok) return;
		const baseline = this.ypActiveCache().baseline.map((it) => ({
			...it,
			id: newYesterdayPlanItemId(),
			notes: [],
			done: false,
		}));
		await this.persistYesterdayPlan(baseline, this.ypActiveCache().baseline.map((it) => ({ ...it })));
		if (this.ypDrawerId) this.closeDetailDrawer();
		new Notice("已重置昨日计划");
	}

	private async toggleYesterdayPlanDone(id: string): Promise<void> {
		const cur = this.ypActiveCache().items.find((it) => it.id === id);
		if (!cur) return;
		const baseline = this.ypActiveCache().baseline.map((it) => ({ ...it }));
		const items = this.ypActiveCache().items.map((it) =>
			it.id === id ? { ...it, done: !it.done } : it,
		);
		await this.persistYesterdayPlan(items, baseline);
		this.renderBoardYesterday();
	}

	private async ypQuickAdd(): Promise<void> {
		const projects = withYpNoProjectOption(this.plugin.store.projects);
		const defaultProject = resolveYpDefaultProject(this.projectFilter);
		const defaultPlanDay = this.view === "cal"
			? this.selectedDay
			: this.boardYpPlanDay();
		const result = await askYpQuickAdd(this.app, projects, defaultProject, defaultPlanDay);
		if (!result) return;
		const titles = parseYesterdayPlanQuickLines(result.text);
		if (!titles.length) {
			new Notice("请输入至少一行标题");
			return;
		}
		const planDay = result.planDay.trim() || defaultPlanDay;
		const reportDate = planReportDateForDay(planDay);
		this.ypEditReportDate = reportDate;

		let items = this.ypActiveCache().items;
		let baseline = this.ypActiveCache().baseline;
		if (this.ypActiveCache().reportDate !== reportDate) {
			try {
				const data = await this.plugin.store.readYesterdayPlan(reportDate);
				items = data.items;
				baseline = data.baseline;
			} catch {
				items = [];
				baseline = [];
			}
		}

		const project = result.project.trim() || YP_NO_PROJECT;
		const added: YesterdayPlanItem[] = titles.map((title) => ({
			id: newYesterdayPlanItemId(),
			title,
			project,
			desc: "",
			notes: [],
			done: false,
		}));
		await this.persistYesterdayPlan(
			[...items, ...added],
			baseline.map((it) => ({ ...it })),
			reportDate,
		);
		if (this.boardYpReportDate() === reportDate) {
			this.renderBoardYesterday();
		}
		if (this.view === "cal" && planReportDateForDay(this.selectedDay) === reportDate) {
			await this.refreshCalPlanCache();
			this.renderCalendar();
		}
		new Notice(`已新增 ${added.length} 条计划（${planDay}）`);
	}

	/** 汇总页：「今日日报」卡片 HTML */
	private dailyReportCardHtml(): string {
		const draft = this.syncDailyReportDraft();
		return `
			<div class="ztk-card ztk-daily-report">
				<div class="ztk-daily-report-head">
					<h2>今日日报</h2>
					<div class="ztk-daily-report-actions">
						<button type="button" class="ztk-ghost" data-act="reset-daily-work" title="按我的今天重新填充今日工作">重置今日工作</button>
						<button type="button" class="ztk-ghost" data-act="reset-daily-plan" title="清空明日计划">重置明日计划</button>
						<button type="button" class="ztk-ghost ztk-daily-copy" data-act="copy-daily-report" title="复制完整日报">复制</button>
					</div>
				</div>
				<label class="ztk-daily-label" for="ztk-daily-work">今日工作</label>
				<textarea id="ztk-daily-work" class="ztk-daily-work" rows="8" placeholder="根据「我的今天」自动填充，可自行修改">${esc(draft.work)}</textarea>
				<label class="ztk-daily-label" for="ztk-daily-plan">明日计划</label>
				<textarea id="ztk-daily-plan" class="ztk-daily-plan" rows="4" placeholder="可自定义明日计划">${esc(draft.plan)}</textarea>
				<label class="ztk-daily-label" for="ztk-daily-discuss">待讨论</label>
				<textarea id="ztk-daily-discuss" class="ztk-daily-discuss" rows="2" placeholder="- 无">${esc(draft.discuss)}</textarea>
			</div>
		`;
	}

	private syncDailyReportDraft() {
		const today = todayStr();
		const todayLogs = this.logsOn(today, "all").map((l) => ({
			title: l.task.title,
			text: l.text,
		}));
		const prev = this.plugin.settings.dailyReportDraft ?? emptyDailyDraft(today);
		if (prev.date && prev.date !== today) {
			void this.archiveDailyDraft(prev);
		}
		const next = refreshDailyDraft(prev, today, todayLogs, this.tasks());
		this.plugin.settings.dailyReportDraft = next;
		if (prev.date && prev.date !== today) {
			void this.plugin.saveSettings();
		}
		return next;
	}

	private async archiveDailyDraft(draft: typeof this.plugin.settings.dailyReportDraft): Promise<void> {
		try {
			const path = await this.plugin.store.upsertDailyReportArchive(draft);
			if (path && draft.date === this.boardYpReportDate()) {
				void this.refreshBoardPlanCache();
			}
			if (path && draft.date === planReportDateForDay(this.selectedDay)) {
				void this.refreshCalPlanCache().then(() => {
					if (this.view === "cal") this.renderCalendar();
				});
			}
		} catch (err) {
			console.error(err);
			new Notice("归档日报失败");
		}
	}

	private persistDailyReportField(el: HTMLTextAreaElement): void {
		const draft = this.syncDailyReportDraft();
		if (el.classList.contains("ztk-daily-work")) {
			draft.work = el.value;
			draft.workCustom = true;
		} else if (el.classList.contains("ztk-daily-plan")) {
			draft.plan = el.value;
			draft.planItems = textToPlanItems(el.value);
			draft.planCustom = true;
			this.plugin.settings.dailyReportDraft = draft;
			void this.plugin.saveSettings();
			// 汇总 textarea 编辑后，同步工作台 list（若当前在工作台可见）
			if (this.contentEl.querySelector(".ztk-board-plan .ztk-tomorrow-plan")) {
				this.renderBoardPlan();
			}
			return;
		} else if (el.classList.contains("ztk-daily-discuss")) {
			draft.discuss = el.value;
		}
		this.plugin.settings.dailyReportDraft = draft;
		void this.plugin.saveSettings();
	}

	private persistPlanItemInput(el: HTMLInputElement): void {
		const id = el.dataset.planId ?? "";
		if (!id) return;
		const draft = this.syncDailyReportDraft();
		const item = draft.planItems.find((it) => it.id === id);
		if (!item) return;
		item.text = el.value;
		draft.planCustom = true;
		draft.plan = planItemsToText(draft.planItems);
		this.plugin.settings.dailyReportDraft = draft;
		void this.plugin.saveSettings();
	}

	private async addTomorrowPlanItem(raw?: string): Promise<void> {
		const draft = this.syncDailyReportDraft();
		const input = this.contentEl.querySelector<HTMLInputElement>(
			".ztk-board-plan .ztk-plan-add-input",
		);
		const text = (raw ?? input?.value ?? "").trim().replace(/^[-*•]\s+/, "");
		if (!text) {
			input?.focus();
			return;
		}
		draft.planItems.push({ id: newPlanItemId(), text });
		draft.planCustom = true;
		draft.plan = planItemsToText(draft.planItems);
		this.plugin.settings.dailyReportDraft = draft;
		await this.plugin.saveSettings();
		this.refreshPlanSurfaces();
	}

	private async removeTomorrowPlanItem(id: string): Promise<void> {
		const draft = this.syncDailyReportDraft();
		draft.planItems = draft.planItems.filter((it) => it.id !== id);
		draft.planCustom = true;
		draft.plan = planItemsToText(draft.planItems);
		this.plugin.settings.dailyReportDraft = draft;
		await this.plugin.saveSettings();
		this.refreshPlanSurfaces();
	}

	/** 同步刷新工作台与汇总上的明日计划 UI */
	private refreshPlanSurfaces(): void {
		if (this.view === "board") this.renderBoardPlan();
		const planArea = this.contentEl.querySelector<HTMLTextAreaElement>(".ztk-daily-plan");
		if (planArea && document.activeElement !== planArea) {
			const draft = this.syncDailyReportDraft();
			planArea.value = draft.plan;
		}
	}

	private async resetDailyReportWork(): Promise<void> {
		const today = todayStr();
		const draft = this.syncDailyReportDraft();
		draft.workCustom = false;
		draft.work = "";
		this.plugin.settings.dailyReportDraft = refreshDailyDraft(
			draft,
			today,
			this.logsOn(today, "all").map((l) => ({ title: l.task.title, text: l.text })),
			this.tasks(),
		);
		await this.plugin.saveSettings();
		this.mdGen += 1;
		const gen = this.mdGen;
		this.renderReport();
		void this.paintMarkdown(gen);
		new Notice("已重置今日工作");
	}

	private async resetDailyReportPlan(): Promise<void> {
		const draft = this.syncDailyReportDraft();
		draft.planItems = [];
		draft.plan = "";
		draft.planCustom = false;
		this.plugin.settings.dailyReportDraft = draft;
		await this.plugin.saveSettings();
		this.refreshPlanSurfaces();
		if (this.view === "report") {
			this.mdGen += 1;
			const gen = this.mdGen;
			this.renderReport();
			void this.paintMarkdown(gen);
		}
		new Notice("已重置明日计划");
	}

	private async copyDailyReport(): Promise<void> {
		const draft = this.syncDailyReportDraft();
		const work = this.contentEl.querySelector<HTMLTextAreaElement>(".ztk-daily-work")?.value
			?? draft.work
			?? "";
		const plan = this.contentEl.querySelector<HTMLTextAreaElement>(".ztk-daily-plan")?.value
			?? draft.plan
			?? planItemsToText(draft.planItems);
		const discuss = this.contentEl.querySelector<HTMLTextAreaElement>(".ztk-daily-discuss")?.value
			?? draft.discuss
			?? "- 无";
		draft.work = work;
		draft.plan = plan;
		draft.planItems = textToPlanItems(plan);
		draft.discuss = discuss;
		this.plugin.settings.dailyReportDraft = draft;
		await this.plugin.saveSettings();
		void this.archiveDailyDraft(draft);
		const text = assembleDailyReportText(work, plan, discuss);
		const ok = await copyText(text);
		new Notice(ok ? "已复制今日日报" : "复制失败，请手动全选复制");
	}


	private filterBarHtml(extra = ""): string {
		return `
			<select class="ztk-type-filter" aria-label="类型筛选">
				<option value="all">全部类型</option>
				<option value="long">长期</option>
				<option value="temp">临时</option>
				<option value="bug">缺陷</option>
			</select>
			<select class="ztk-status-filter" aria-label="状态筛选">
				<option value="all">全部状态</option>
				<option value="todo">未开始</option>
				<option value="doing">进行中</option>
				<option value="done">已完结</option>
				<option value="!done">不包括已完结</option>
				<option value="!todo">不包括未开始</option>
				<option value="!doing">不包括进行中</option>
			</select>
			<span class="ztk-catalog-dates" title="按任务周期重叠筛选">
				<input type="date" class="ztk-catalog-date-start" aria-label="周期起" value="${esc(this.catalogDateStart)}" />
				<span class="ztk-period-tilde">~</span>
				<input type="date" class="ztk-catalog-date-end" aria-label="周期止" value="${esc(this.catalogDateEnd)}" />
			</span>
			${extra}
		`;
	}


	private renderFilters(): void {
		this.$(".ztk-filters").innerHTML = this.filterBarHtml(
			`<input class="ztk-search" type="search" placeholder="搜索标题或说明" value="${esc(this.query)}" />
			<span class="ztk-catalog-count">${this.catalogFiltered().length} / ${this.projectTasks().length}</span>`,
		);
		this.contentEl.querySelectorAll<HTMLSelectElement>(".ztk-type-filter").forEach((el) => {
			el.value = this.typeFilter;
		});
		this.contentEl.querySelectorAll<HTMLSelectElement>(".ztk-status-filter").forEach((el) => {
			el.value = this.statusFilter;
		});
	}


	private renderCatalog(): void {
		const items = this.catalogFiltered();
		const sortMark = (key: CatalogSortKey) => {
			if (this.catalogSort?.key !== key) return "";
			return this.catalogSort.dir === "asc" ? " ▲" : " ▼";
		};
		const sortClass = (key: CatalogSortKey) =>
			this.catalogSort?.key === key ? " is-sorted" : "";
		const rows = items.map((t) => {
			const hours = sumHours(t.logs);
			const hoursLabel = hours > 0 ? esc(formatHours(hours)) : "—";
			return `
			<tr data-act="goto-task" data-id="${esc(t.id)}" class="${t.id === this.selectedId && this.detailOpen ? "sel" : ""}">
				<td class="ztk-catalog-drag">
					<button type="button" class="ztk-drag-handle" draggable="true" title="拖拽排序" aria-label="拖拽排序">⋮⋮</button>
				</td>
				<td><span class="ztk-rail-dot ${t.type}"></span>${esc(t.title)}</td>
				<td>${projectBadgeHtml(t.project)}</td>
				<td>${TYPE_LABEL[t.type]}</td>
				<td><span class="ztk-st ${t.status}">${STATUS_LABEL[t.status]}</span></td>
				<td>${esc(t.start)} → ${esc(t.end)}</td>
				<td>${t.logs.length} 笔</td>
				<td class="ztk-catalog-hours">${hoursLabel}</td>
				<td class="ztk-catalog-actions">
					<button type="button" class="ztk-task-del" data-act="del-task" data-id="${esc(t.id)}" title="删除任务" aria-label="删除任务">×</button>
				</td>
			</tr>`;
		}).join("");
		this.$(".ztk-catalog-body").innerHTML = `
			<table>
				<thead>
					<tr>
						<th></th>
						<th>标题</th>
						<th>项目</th>
						<th>
							<button type="button" class="ztk-th-sort${sortClass("type")}" data-act="catalog-sort" data-key="type" title="按类型排序">类型${sortMark("type")}</button>
						</th>
						<th>
							<button type="button" class="ztk-th-sort${sortClass("status")}" data-act="catalog-sort" data-key="status" title="按状态排序">状态${sortMark("status")}</button>
						</th>
						<th>周期</th>
						<th>进展</th>
						<th>
							<button type="button" class="ztk-th-sort${sortClass("hours")}" data-act="catalog-sort" data-key="hours" title="按工时排序">工时${sortMark("hours")}</button>
						</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${rows || `<tr><td colspan="9">没有匹配的任务</td></tr>`}
				</tbody>
			</table>
		`;
		const count = this.contentEl.querySelector(".ztk-catalog-count");
		if (count) count.textContent = `${items.length} / ${this.projectTasks().length}`;
	}

	private activeDetail(): HTMLElement {
		return this.$("#ztk-view-board .ztk-detail");
	}

	private renderProjectMgrDetail(el: HTMLElement): void {
		el.classList.remove("is-yp-drawer");
		el.classList.add("is-pm-drawer");
		const projects = this.plugin.store.projects;
		const rows = projects.length
			? projects.map((name) => {
				const editing = this.projectMgrRenameFrom === name;
				const body = editing
					? `<input class="ztk-pm-rename-input" data-project="${esc(name)}" value="${esc(name)}" aria-label="新项目名" />
						<button type="button" class="ztk-ghost" data-act="pm-rename-cancel">取消</button>
						<button type="button" class="ztk-btn" data-act="pm-rename-save" data-project="${esc(name)}">保存</button>`
					: `<span class="ztk-pm-name">${esc(name)}</span>
						<button type="button" class="ztk-ghost" data-act="pm-rename" data-project="${esc(name)}">重命名</button>
						<button type="button" class="ztk-ghost ztk-pm-del" data-act="pm-delete" data-project="${esc(name)}">删除</button>`;
				return `<li class="ztk-pm-row${editing ? " is-editing" : ""}" data-project="${esc(name)}">${body}</li>`;
			}).join("")
			: `<li class="ztk-pm-empty ztk-muted">暂无项目，在上方新增</li>`;
		el.innerHTML = `
			<div class="ztk-detail-head">
				<div class="ztk-detail-head-top">
					<div class="ztk-title-block">
						<h1 class="ztk-detail-title">项目管理</h1>
						<div class="ztk-kicker">新增、重命名或删除业务项目</div>
					</div>
					<button type="button" class="ztk-ghost ztk-detail-close" data-act="close-detail" title="关闭" aria-label="关闭">×</button>
				</div>
			</div>
			<div class="ztk-pm-add">
				<input class="ztk-pm-add-input" type="text" placeholder="新项目名称，例如 终端安全" autocomplete="off" />
				<button type="button" class="ztk-btn" data-act="pm-add">新增</button>
			</div>
			<ul class="ztk-pm-list">${rows}</ul>
		`;
		requestAnimationFrame(() => {
			if (this.projectMgrRenameFrom) {
				el.querySelector<HTMLInputElement>(".ztk-pm-rename-input")?.focus();
			} else {
				el.querySelector<HTMLInputElement>(".ztk-pm-add-input")?.focus();
			}
		});
	}

	private renderYpDetail(el: HTMLElement): void {
		el.classList.remove("is-pm-drawer");
		const isNew = this.ypDrawerId === YP_DRAWER_NEW;
		const item = isNew
			? null
			: this.ypActiveCache().items.find((it) => it.id === this.ypDrawerId) ?? null;
		const title = item?.title ?? "";
		const project = item?.project
			|| resolveYpDefaultProject(this.projectFilter);
		const desc = item?.desc ?? "";
		const projects = withYpNoProjectOption(this.plugin.store.projects);
		const projectOpts = [
			...projects.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`),
			projects.includes(project) ? "" : `<option value="${esc(project)}">${esc(project)}</option>`,
		].join("");
		const notes = [...(item?.notes ?? [])]
			.map((n, idx) => ({ ...n, idx }))
			.sort((a, b) => b.date.localeCompare(a.date) || b.idx - a.idx);
		const displayTitle = title.trim() || "未命名计划";
		const titleActions = this.editingTitle
			? `<div class="ztk-title-edit">
					<input id="ztk-title-input" class="ztk-title-input" value="${esc(title)}" placeholder="计划标题" />
					<div class="ztk-title-edit-actions">
						${isNew ? "" : iconBtn("cancel-title", "cancel", "取消")}
						${iconBtn("save-title", "save", "保存")}
					</div>
				</div>`
			: `<h1 class="ztk-detail-title" title="右键可修改标题">${esc(displayTitle)}</h1>`;
		const closeBtn = this.editingTitle && !isNew
			? ""
			: `<button type="button" class="ztk-ghost ztk-detail-close" data-act="close-detail" title="关闭" aria-label="关闭">×</button>`;
		el.innerHTML = `
			<div class="ztk-detail-head ztk-yp-detail-head">
				<div class="ztk-detail-head-top">
					<div class="ztk-title-block">
						${titleActions}
					</div>
					${closeBtn}
				</div>
				<div class="ztk-kicker ztk-yp-kicker">${isNew ? "新增计划" : "编辑计划"}</div>
				<div class="ztk-meta-fields">
					<label>所属项目
						<select class="ztk-yp-project">${projectOpts}</select>
					</label>
				</div>
			</div>
			${descBlockHtml({ editing: this.editingDesc, desc, path: "" })}
			<div class="ztk-yp-drawer-actions">
				<button type="button" class="ztk-btn" data-act="yp-drawer-save">${isNew ? "保存计划" : "保存"}</button>
			</div>
			<div class="ztk-composer">
				<label>记一笔 · ${todayStr()}</label>
				<textarea id="ztk-yp-log-text" placeholder="写进展（无需工时）"></textarea>
				<div class="ztk-composer-row">
					<button class="ztk-btn" data-act="yp-drawer-add-log" type="button">记一笔</button>
				</div>
			</div>
			<div class="ztk-log-list">
				${item
					? (notes.map((n) => this.ypNoteRowHtml(n, n.idx)).join("")
						|| `<p class="ztk-muted">还没有进展，从上面记第一笔。</p>`)
					: `<p class="ztk-muted">保存计划后可记进展。</p>`}
			</div>
		`;
		el.classList.add("is-yp-drawer");
		const projectEl = el.querySelector(".ztk-yp-project") as HTMLSelectElement | null;
		if (projectEl) projectEl.value = project;
	}

	private renderDetail(): void {
		const el = this.activeDetail();
		if (!this.detailOpen || (!this.selectedId && !this.ypDrawerId && !this.projectMgrOpen)) {
			el.innerHTML = "";
			el.classList.remove("is-yp-drawer", "is-pm-drawer");
			return;
		}
		if (this.projectMgrOpen) {
			this.renderProjectMgrDetail(el);
			return;
		}
		if (this.ypDrawerId) {
			this.renderYpDetail(el);
			return;
		}
		el.classList.remove("is-yp-drawer", "is-pm-drawer");
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t) {
			el.innerHTML = `
				<div class="ztk-detail-head ztk-detail-head-empty">
					<button type="button" class="ztk-ghost ztk-detail-close" data-act="close-detail" title="关闭" aria-label="关闭">×</button>
				</div>
				<div class="ztk-empty">选一条任务，在这里写今天的进展</div>
			`;
			return;
		}
		const logs = [...t.logs].sort((a, b) => b.date.localeCompare(a.date));
		const taskTitleEdit = this.editingTitle
			? `<div class="ztk-title-edit">
					<input id="ztk-title-input" class="ztk-title-input" value="${esc(t.title)}" />
					<div class="ztk-title-edit-actions">
						${iconBtn("cancel-title", "cancel", "取消")}
						${iconBtn("save-title", "save", "保存")}
					</div>
				</div>`
			: `<h1 class="ztk-detail-title" title="右键可修改标题">${esc(t.title)}</h1>`;
		const taskCloseBtn = this.editingTitle
			? ""
			: `<button type="button" class="ztk-ghost ztk-detail-close" data-act="close-detail" title="关闭" aria-label="关闭">×</button>`;
		el.innerHTML = `
			<div class="ztk-detail-head">
				<div class="ztk-detail-head-top">
					<div class="ztk-title-block">
						${taskTitleEdit}
						<div class="ztk-kicker">${esc(t.path)}</div>
					</div>
					${taskCloseBtn}
				</div>
				<div class="ztk-meta-fields">
					<label>项目
						<select class="ztk-task-project">
							${this.plugin.store.projects.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("")}
							${this.plugin.store.projects.includes(t.project) ? "" : `<option value="${esc(t.project)}">${esc(t.project)}</option>`}
						</select>
					</label>
					<label>类型
						<select class="ztk-task-type">
							<option value="long">长期</option>
							<option value="temp">临时</option>
							<option value="bug">缺陷</option>
						</select>
					</label>
					<label>状态
						<select class="ztk-task-status">
							<option value="todo">未开始</option>
							<option value="doing">进行中</option>
							<option value="done">已完结</option>
						</select>
					</label>
				</div>
			</div>
			<div class="ztk-meta"><span>${esc(t.start)} → ${esc(t.end)}</span><span>${t.logs.length} 条进展</span></div>
			${descBlockHtml({ editing: this.editingDesc, desc: t.desc, path: t.path })}
			<div class="ztk-composer">
				<label>记今天 · ${todayStr()}</label>
				<textarea id="ztk-log-text" placeholder="支持 Markdown：列表、加粗、链接、[[笔记]]"></textarea>
				<div class="ztk-composer-row">
					<label class="ztk-hours-field">工时 (h)
						<input id="ztk-log-hours" type="number" min="0.1" step="0.1" inputmode="decimal" placeholder="必填" />
					</label>
					<button class="ztk-btn" data-act="add-log" type="button">记一笔</button>
				</div>
			</div>
			<div class="ztk-log-list">
				${logs.map((l) => this.logRowHtml(l)).join("") || `<p class="ztk-muted">还没有进展，从上面记第一笔。</p>`}
			</div>
		`;
		const projectEl = el.querySelector(".ztk-task-project") as HTMLSelectElement | null;
		const typeEl = el.querySelector(".ztk-task-type") as HTMLSelectElement | null;
		const statusEl = el.querySelector(".ztk-task-status") as HTMLSelectElement | null;
		if (projectEl) projectEl.value = t.project;
		if (typeEl) typeEl.value = t.type;
		if (statusEl) statusEl.value = t.status;
	}

	private logRowHtml(log: { date: string; text: string; hours?: number }, path?: string): string {
		const taskPath = path ?? this.tasks().find((x) => x.id === this.selectedId)?.path ?? "";
		const badge = log.hours !== undefined && log.hours > 0
			? `<span class="ztk-hours-badge">${esc(formatHours(log.hours))}</span>`
			: "";
		if (this.editingLogDate === log.date) {
			const hoursVal = log.hours !== undefined && log.hours > 0 ? String(log.hours) : "";
			const currentId = this.selectedId;
			const taskOptions = this.tasks()
				.slice()
				.sort((a, b) =>
					a.project.localeCompare(b.project, "zh")
					|| a.title.localeCompare(b.title, "zh"),
				)
				.map((x) => `<option value="${esc(x.id)}"${x.id === currentId ? " selected" : ""}>${esc(x.project)} · ${esc(x.title)}</option>`)
				.join("");
			return `<div class="ztk-log is-editing" data-date="${esc(log.date)}">
				<div class="ztk-log-when"><time>${esc(log.date)}</time>${badge}</div>
				<div class="ztk-log-body">
					<div class="ztk-log-edit-meta">
						<label class="ztk-log-field">日期
							<input class="ztk-log-date-edit" type="date" value="${esc(log.date)}" />
						</label>
						<label class="ztk-log-field ztk-log-field-task">任务
							<select class="ztk-log-task-edit">${taskOptions}</select>
						</label>
						<label class="ztk-hours-field">工时 (h)
							<input class="ztk-log-hours-edit" type="number" min="0.1" step="0.1" inputmode="decimal" value="${esc(hoursVal)}" />
						</label>
					</div>
					<textarea class="ztk-log-edit">${esc(log.text)}</textarea>
				</div>
				<div class="ztk-log-actions">
					${iconBtn("save-log", "save", "保存")}
					${iconBtn("cancel-log", "cancel", "取消")}
				</div>
			</div>`;
		}
		return `<div class="ztk-log" data-date="${esc(log.date)}">
			<div class="ztk-log-when"><time>${esc(log.date)}</time>${badge}</div>
			<div class="ztk-log-body">${this.mdSlot(taskPath, log.date)}</div>
			<div class="ztk-log-actions">
				${iconBtn("copy-log", "copy", "复制")}
				${iconBtn("edit-log", "edit", "编辑")}
				${iconBtn("del-log", "del", "删除")}
			</div>
		</div>`;
	}

	private renderCalendar(): void {
		this.syncCalDayPane();
		const y = this.calCursor.getFullYear();
		const m = this.calCursor.getMonth();
		this.$(".ztk-cal-title").textContent = `${y} 年 ${m + 1} 月`;
		const first = new Date(y, m, 1);
		const startOffset = (first.getDay() + 6) % 7;
		const gridStart = addDays(first, -startOffset);
		let html = "";
		for (let i = 0; i < 42; i++) {
			const d = addDays(gridStart, i);
			const key = fmt(d);
			const logs = this.logsOn(key);
			const dayTotal = sumHours(logs);
			const hoursLabel = dayTotal > 0 ? `<span class="ztk-day-hours">${esc(formatHours(dayTotal))}</span>` : "";
			const cls = [
				"ztk-day",
				d.getMonth() !== m ? "out" : "",
				key === todayStr() ? "today" : "",
				key === this.selectedDay ? "sel" : "",
			].join(" ");
			const items = logs.slice(0, 3).map((l) => `<div class="ztk-day-item">${esc(l.task.title)}</div>`).join("");
			const more = logs.length > 3 ? `<div class="ztk-day-item">+${logs.length - 3}</div>` : "";
			html += `<div class="${cls}" data-day="${key}"><div class="ztk-day-num"><span>${d.getDate()}</span>${hoursLabel}</div>${items}${more}</div>`;
		}
		this.$(".ztk-days").innerHTML = html;
		const dayLogs = this.logsOn(this.selectedDay);
		const paneTotal = sumHours(dayLogs);
		const paneHours = paneTotal > 0 ? ` · ${formatHours(paneTotal)}` : "";
		const collapsed = this.plugin.settings.calDayPaneCollapsed === true;
		const calReport = planReportDateForDay(this.selectedDay);
		if (this.calPlanCache.reportDate !== calReport) {
			void this.refreshCalPlanCache().then(() => {
				if (this.view === "cal") this.renderCalendar();
			});
		}
		const planSelected = this.ypDrawerId && this.ypDrawerId !== YP_DRAWER_NEW ? this.ypDrawerId : null;
		const planList = yesterdayPlanListHtml({
			items: this.calPlanCache.reportDate === calReport ? this.calPlanCache.items : [],
			selectedId: planSelected,
			emptyText: "这天还没有计划",
			reportDate: calReport,
		});
		this.$(".ztk-day-pane").innerHTML = `
			<div class="ztk-day-pane-head">
				<h2>${this.selectedDay}${esc(paneHours)}</h2>
				<button class="ztk-ghost ztk-cal-day-toggle" data-act="toggle-cal-day" type="button" title="${collapsed ? "展开详情" : "折叠详情"}">${collapsed ? "›" : "‹"}</button>
			</div>
			<section class="ztk-day-pane-section ztk-day-pane-tasks" data-yp-report="${esc(calReport)}">
				<div class="ztk-day-pane-section-head">
					<h3>任务</h3>
				</div>
				${dayLogs.length
					? dayLogs.map((l) => `<div class="ztk-log ztk-day-log">
						<div class="ztk-day-log-head">
							<button class="ztk-ghost" data-act="goto-task" data-id="${esc(l.task.id)}" type="button">${esc(l.task.title)}</button>
							${hoursBadgeHtml(l.hours)}
						</div>
						<div class="ztk-log-body">${this.mdSlot(l.task.path, l.date)}</div>
					</div>`).join("")
					: `<p class="ztk-muted">这天还没有进展记录</p>`}
			</section>
			<section class="ztk-day-pane-section ztk-day-pane-plans" data-yp-report="${esc(calReport)}">
				<div class="ztk-day-pane-section-head">
					<h3>计划</h3>
					<button type="button" class="ztk-ghost ztk-plan-add-btn" data-act="cal-add-plan" title="新增计划" aria-label="新增计划">+</button>
				</div>
				${planList}
			</section>
		`;
		this.syncCalDayPane();
	}

	private syncCalDayPane(): void {
		const cal = this.contentEl.querySelector("#ztk-view-cal");
		if (!cal) return;
		const collapsed = this.plugin.settings.calDayPaneCollapsed === true;
		cal.classList.toggle("is-day-collapsed", collapsed);
		cal.querySelectorAll<HTMLButtonElement>(".ztk-cal-day-toggle").forEach((btn) => {
			const isBar = btn.classList.contains("ztk-cal-day-toggle--bar");
			if (isBar) {
				btn.textContent = collapsed ? "展开详情" : "折叠详情";
				btn.title = btn.textContent;
			} else {
				btn.textContent = collapsed ? "›" : "‹";
				btn.title = collapsed ? "展开详情" : "折叠详情";
			}
		});
	}

	private async toggleCalDayPane(): Promise<void> {
		this.plugin.settings.calDayPaneCollapsed = !this.plugin.settings.calDayPaneCollapsed;
		this.syncCalDayPane();
		await this.plugin.saveSettings();
	}

	private refreshCalendar(): void {
		this.mdGen += 1;
		const gen = this.mdGen;
		this.renderCalendar();
		void this.paintMarkdown(gen);
	}

	private refreshGantt(): void {
		this.mdGen += 1;
		const gen = this.mdGen;
		this.renderGantt();
		void this.paintMarkdown(gen);
	}

	private ganttUnits(range: { start: Date; end: Date }) {
		const days = Math.max(1, daysBetween(range.start, range.end) + 1);
		const scale = ganttScaleForDays(days);
		const units = buildGanttUnits(fmt(range.start), fmt(range.end), scale);
		if (units.length) return units;
		return [{ start: new Date(range.start), end: new Date(range.end), label: String(range.start.getDate()) }];
	}

	private renderGantt(): void {
		const r = this.periodRange();
		const units = this.ganttUnits(r);
		const days = daysBetween(r.start, r.end) + 1;
		const scale = ganttScaleForDays(days);
		const scaleHint = { day: "按天", week: "按周", month: "按月" }[scale];
		this.$(".ztk-gantt-hint").textContent = `${r.startStr} 至 ${r.endStr} · ${r.label} · ${scaleHint}`;
		const today = parseDate(todayStr());
		const todayIdx = units.findIndex((u) => today >= u.start && today <= u.end);
		const todayPct = todayIdx < 0 ? -1 : ((todayIdx + 0.5) / units.length) * 100;
		const rows = this.filtered();
		this.$(".ztk-gantt-pane").innerHTML = `<div class="ztk-gantt">
			<div>
				<div class="ztk-gantt-head"></div>
				${rows.map((t) => `<div class="ztk-gantt-row ${t.id === this.ganttTaskId ? "sel" : ""}" data-gid="${esc(t.id)}">${esc(t.title)}</div>`).join("")}
			</div>
			<div style="position:relative">
				${todayPct >= 0 ? `<div class="ztk-today-line" style="left:${todayPct}%"></div>` : ""}
				<div class="ztk-gantt-head">${units.map((u) => `<div class="ztk-col">${u.label}</div>`).join("")}</div>
				${rows.map((t) => {
					const ts = parseDate(t.start || r.startStr);
					const te = parseDate(t.end || r.endStr);
					const startIdx = units.findIndex((u) => te >= u.start && ts <= u.end);
					let endIdx = startIdx;
					for (let i = 0; i < units.length; i++) {
						const u = units[i];
						if (u && ts <= u.end && te >= u.start) endIdx = i;
					}
					if (startIdx < 0) return `<div class="ztk-gantt-track" data-gid="${esc(t.id)}"></div>`;
					const left = (startIdx / units.length) * 100;
					const width = Math.max(1.5, ((endIdx - startIdx + 1) / units.length) * 100);
					const ticks = t.logs.map((l) => {
						const d = parseDate(l.date);
						const i = units.findIndex((u) => d >= u.start && d <= u.end);
						if (i < 0) return "";
						const p = ((i - startIdx + 0.4) / Math.max(1, endIdx - startIdx + 1)) * 100;
						return `<i class="ztk-tick" title="${esc(l.date)}: ${esc(l.text)}" style="left:${Math.min(96, Math.max(2, p))}%"></i>`;
					}).join("");
					return `<div class="ztk-gantt-track" data-gid="${esc(t.id)}"><div class="ztk-bar ${t.type} ${t.status}" style="left:${left}%;width:${width}%">${ticks}</div></div>`;
				}).join("")}
			</div>
		</div>`;
		const focus = this.tasks().find((t) => t.id === this.ganttTaskId) ?? rows[0];
		const logs = focus ? focus.logs.filter((l) => this.inRange(l.date, r)).sort((a, b) => b.date.localeCompare(a.date)) : [];
		this.$(".ztk-gantt-logs").innerHTML = focus
			? `<strong>${esc(focus.title)} · ${r.label}做了什么</strong>${logs.map((l) => `<div class="ztk-log"><time>${esc(l.date)}</time><div class="ztk-log-body">${this.mdSlot(focus.path, l.date)}</div></div>`).join("") || `<p class="ztk-muted">这个周期还没有进展</p>`}`
			: "";
	}

	private renderReport(): void {
		const r = this.periodRange();
		const today = todayStr();
		const todayLogs = this.logsOn(today, "all");
		const logs = this.logsInPeriod().sort((a, b) => b.date.localeCompare(a.date));
		const countByDay: Record<string, number> = {};
		for (const l of logs) countByDay[l.date] = (countByDay[l.date] ?? 0) + 1;
		const heatDays = daysBetween(r.start, r.end) + 1;
		let heat = "";
		for (let i = 0; i < Math.min(heatDays, 370); i++) {
			const d = fmt(addDays(r.start, i));
			const n = countByDay[d] ?? 0;
			heat += `<i class="${n >= 3 ? "l3" : n === 2 ? "l2" : n === 1 ? "l1" : ""}" title="${d} · ${n} 笔"></i>`;
		}
		const showProject = this.projectFilter === "all";
		const logItems = logs.map((l) => ({
			date: l.date,
			title: l.task.title,
			path: l.task.path,
			project: l.task.project,
			hours: l.hours,
			showProject,
		}));
		const taskGroups = groupReportLogsByTask(logItems);
		const listHtml = this.reportByTask
			? taskGroups.map((g) => reportMergedGroupHtml(g, showProject)).join("")
			: logItems.map((l) => reportLogRowHtml(l)).join("");
		this.$("#ztk-view-report").innerHTML = `
			<div class="ztk-report-top">
				${todayDigestHtml(
					today,
					todayLogs.map((l) => ({
						id: l.task.id,
						title: l.task.title,
						path: l.task.path,
						project: l.task.project,
						hours: l.hours,
					})),
					{ groupByProject: this.plugin.settings.todayGroupByProject === true },
				)}
				${this.dailyReportCardHtml()}
			</div>
			<div class="ztk-report-body">
				<div class="ztk-report-main">
					<div class="ztk-card ztk-report-logs">
						${reportLogsHeadHtml(r.label, this.reportByTask, this.reportQuery)}
						<div class="ztk-report-list">
							${listHtml || `<p class="ztk-muted">这个周期还没有记录</p>`}
						</div>
					</div>
				</div>
				<aside class="ztk-report-side">
					<div class="ztk-card ztk-report-overview">
						<h2>活跃分布</h2>
						<div class="ztk-heat">${heat}</div>
					</div>
					<div class="ztk-card ztk-report-overview">
						<h2>按任务计数</h2>
						<div class="ztk-count-list">
							${taskGroups.map((g) => reportTaskCountRowHtml(g.title, g.count, g.hours)).join("") || `<p class="ztk-muted">暂无</p>`}
						</div>
					</div>
				</aside>
			</div>
		`;
	}
}

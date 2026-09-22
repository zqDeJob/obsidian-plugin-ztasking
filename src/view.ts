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
	prevDateStr,
	yesterdayPlanBlockHtml,
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
	resolveNewTaskProject,
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
import { mergeSidebarOrder, pickSidebarTasks, reorderSidebarIds, isSidebarStatusFilter, type SidebarStatusFilter } from "./sidebar";
import { WebPanel } from "./web-panel";

type BoardView = "board" | "list" | "detail" | "cal" | "gantt" | "report" | "web";
type TopTab = "report" | "work" | "schedule" | "web";
type WorkMode = "board" | "list";
type ScheduleMode = "cal" | "gantt";
const VIEWS: BoardView[] = ["board", "list", "detail", "cal", "gantt", "report", "web"];
const PERIOD_SHORTCUTS = ["week", "month", "quarter", "year"] as const;

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

export class ZTaskingView extends ItemView {
	plugin: ZTaskingPlugin;
	view: BoardView = "report";
	/** 工作台顶栏下的子模式（列表 / 工作台） */
	workMode: WorkMode = "board";
	/** 日历顶栏下的子模式（日历 / 甘特） */
	scheduleMode: ScheduleMode = "cal";
	period: PeriodPreset = "week";
	rangeStart = "";
	rangeEnd = "";
	/** 列表页类型筛选（含全部） */
	typeFilter: "all" | TaskType = "all";
	/** 列表页状态筛选 */
	statusFilter: "all" | TaskStatus = "all";
	/** 侧边栏当前类型 Tab */
	sidebarType: TaskType = "long";
	/** 侧边栏状态筛选（默认不包括已完结） */
	sidebarStatus: SidebarStatusFilter = "!done";
	query = "";
	selectedId = "";
	calCursor = new Date();
	selectedDay = todayStr();
	ganttTaskId = "";
	editingLogDate: string | null = null;
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
	/** 工作台三列：昨日 / 中间(今天+明日) / 列表 的相对宽度 */
	private yesterdayPaneRatio = 0.22;
	private todayPaneRatio = 0.38;
	/** 拖拽排序结束后抑制一次 click，避免误选中 */
	private suppressTaskClick = false;
	/** 任务详情抽屉是否打开（默认关闭） */
	private detailOpen = false;
	/** 昨日计划缓存（按「相对今天的昨日」日期键） */
	private yesterdayPlanCache: { path: string | null; items: string[] } = { path: null, items: [] };
	private yesterdayPlanLoadedFor = "";

	constructor(leaf: WorkspaceLeaf, plugin: ZTaskingPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.webPanel = new WebPanel(plugin);
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
				<button class="ztk-btn" data-act="new-project" type="button">新建项目</button>
				<button class="ztk-btn" data-act="new" type="button">新建任务</button>
			</header>
			<main class="ztk-main">
				<div class="ztk-page" id="ztk-view-board" data-mode="board" data-detail-open="0">
					<nav class="ztk-work-rail" aria-label="工作模式">
						<button type="button" data-work-mode="board" class="on"><span>工作台</span></button>
						<button type="button" data-work-mode="list"><span>列表</span></button>
					</nav>
					<aside class="ztk-yesterday-pane">
						<div class="ztk-board-yesterday"></div>
					</aside>
					<aside class="ztk-today-pane">
						<div class="ztk-board-today"></div>
						<div class="ztk-board-plan"></div>
					</aside>
					<aside class="ztk-list">
						<div class="ztk-filters"></div>
						<div class="ztk-task-list"></div>
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
							<input name="project" list="ztk-project-options" required placeholder="如 KVAD" />
							<datalist id="ztk-project-options"></datalist>
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
			<div class="ztk-modal ztk-project-modal">
				<form class="ztk-modal-card ztk-project-modal-card">
					<h2>新建项目</h2>
					<div class="ztk-form">
						<label class="ztk-field">
							<span>项目名称</span>
							<input name="projectName" required placeholder="例如 终端安全" autocomplete="off" />
						</label>
						<p class="ztk-muted ztk-modal-hint">将创建 Z-Tasking/项目名/长期|临时|缺陷</p>
					</div>
					<div class="ztk-modal-actions">
						<button type="button" class="ztk-ghost" data-act="cancel-project">取消</button>
						<button class="ztk-btn" type="submit">创建</button>
					</div>
				</form>
			</div>
		`;
		this.bind();
		this.applyPeriodShortcut("week");
		try {
			await this.plugin.store.reload();
		} catch (err) {
			console.error("Z-Tasking reload", err);
			new Notice("Z-Tasking 加载失败，请查看控制台");
		}
		this.renderAll();
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
			(this.statusFilter === "all" || t.status === this.statusFilter)
		);
	}

	private catalogFiltered(): Task[] {
		const q = this.query.trim().toLowerCase();
		return this.filtered().filter((t) =>
			!q || t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
		);
	}

	private sidebarTasks(): Task[] {
		const pool = this.projectTasks();
		const saved = this.plugin.settings.sidebarOrder?.[this.sidebarType] ?? [];
		const order = saved.length
			? mergeSidebarOrder(
				pool.filter((t) => t.type === this.sidebarType),
				saved,
			)
			: undefined;
		return pickSidebarTasks(pool, this.sidebarType, this.sidebarStatus, order);
	}

	private topTabFor(view: BoardView): TopTab {
		if (view === "report") return "report";
		if (view === "cal" || view === "gantt") return "schedule";
		if (view === "web") return "web";
		return "work";
	}

	private switchTopTab(tab: TopTab): void {
		if (tab === "report") this.switchView("report");
		else if (tab === "work") this.switchView(this.workMode);
		else if (tab === "schedule") this.switchView(this.scheduleMode);
		else if (tab === "web") this.switchView("web");
	}

	private switchView(view: BoardView): void {
		// 详情并入工作壳右侧，不再单独占页
		if (view === "detail") view = "list";
		this.view = view;
		if (view === "board" || view === "list") this.workMode = view;
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
		if (view === "board" || view === "list") {
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
		if (view === "list" || view === "detail") return "board";
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
			const workMode = target.closest<HTMLElement>("[data-work-mode]");
			if (workMode?.dataset.workMode === "board" || workMode?.dataset.workMode === "list") {
				this.switchView(workMode.dataset.workMode);
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
				if (a === "new") this.openModal();
				if (a === "new-project") this.openProjectModal();
				if (a === "cancel") this.closeModal();
				if (a === "cancel-project") this.closeProjectModal();
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
				if (a === "open-yesterday-plan" && act.dataset.path) {
					void this.openYesterdayPlan(act.dataset.path);
					return;
				}
				if (a === "close-detail") {
					this.closeDetailDrawer();
					return;
				}
				if (a === "edit-log" || a === "save-log" || a === "cancel-log" || a === "del-log") {
					const date = act.closest<HTMLElement>("[data-date]")?.dataset.date;
					if (date) void this.handleLogAction(a, date);
					return;
				}
				if (a === "copy-log") {
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
					this.openTaskDetail(act.dataset.id);
					if (this.view === "board" || this.view === "list") {
						this.syncWorkShell();
						this.syncDetailDrawer();
						this.rerenderDetail();
					} else {
						this.switchView("list");
						this.renderAll();
					}
					return;
				}
				if (a === "del-task" && act.dataset.id) {
					void this.deleteTaskById(act.dataset.id);
					return;
				}
				if (a === "back-list" || a === "open-list") {
					this.switchView("list");
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
				this.renderBoardToday(this.workMode === "board");
				if (this.view === "report") this.renderReport();
				void this.paintMarkdown(gen);
				return;
			}
			if (el.classList.contains("ztk-status-filter")) {
				this.statusFilter = (el as HTMLSelectElement).value as "all" | TaskStatus;
				this.renderFilters();
				this.renderCatalog();
			}
			if (el.classList.contains("ztk-side-type")) {
				const v = (el as HTMLSelectElement).value;
				if (v === "long" || v === "temp" || v === "bug") {
					this.sidebarType = v;
					this.renderList();
				}
			}
			if (el.classList.contains("ztk-side-status")) {
				const v = (el as HTMLSelectElement).value;
				if (isSidebarStatusFilter(v)) {
					this.sidebarStatus = v;
					this.renderList();
				}
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
			if (el.classList.contains("ztk-range-start") || el.classList.contains("ztk-range-end")) {
				this.applyCustomRangeFromInputs();
				this.refreshPeriodViews();
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
			if (!el.classList.contains("ztk-plan-add-input")) return;
			if (e.key !== "Enter") return;
			e.preventDefault();
			void this.addTomorrowPlanItem(el.value);
		});
		this.$(".ztk-modal-card").addEventListener("submit", (e) => {
			e.preventDefault();
			void this.createTask(e.target as HTMLFormElement);
		});
		this.$(".ztk-project-modal-card").addEventListener("submit", (e) => {
			e.preventDefault();
			void this.createProject(e.target as HTMLFormElement);
		});
		this.bindListReorder();
		window.addEventListener("resize", () => {
			if (this.view === "board" || this.view === "list") this.applyBoardLayout();
		});
	}

	private bindListReorder(): void {
		const root = this.contentEl;
		let dragId = "";
		const clearMarks = () => {
			root.querySelectorAll(".ztk-task.is-dragging, .ztk-task.is-drag-over").forEach((el) => {
				el.classList.remove("is-dragging", "is-drag-over");
			});
		};
		root.addEventListener("dragstart", (e) => {
			const handle = (e.target as HTMLElement).closest(".ztk-drag-handle");
			const task = handle?.closest<HTMLElement>(".ztk-task");
			if (!handle || !task?.dataset.id) {
				e.preventDefault();
				return;
			}
			dragId = task.dataset.id;
			task.classList.add("is-dragging");
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
			const task = (e.target as HTMLElement).closest<HTMLElement>(".ztk-task");
			if (!task?.dataset.id || !dragId || task.dataset.id === dragId) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			root.querySelectorAll(".ztk-task.is-drag-over").forEach((el) => {
				if (el !== task) el.classList.remove("is-drag-over");
			});
			task.classList.add("is-drag-over");
		});
		root.addEventListener("dragleave", (e) => {
			const task = (e.target as HTMLElement).closest<HTMLElement>(".ztk-task");
			const related = e.relatedTarget as HTMLElement | null;
			if (task && related && task.contains(related)) return;
			task?.classList.remove("is-drag-over");
		});
		root.addEventListener("drop", (e) => {
			const task = (e.target as HTMLElement).closest<HTMLElement>(".ztk-task");
			const toId = task?.dataset.id ?? "";
			const fromId = dragId || e.dataTransfer?.getData("text/plain") || "";
			clearMarks();
			if (!fromId || !toId || fromId === toId) return;
			e.preventDefault();
			void this.commitSidebarReorder(fromId, toId);
		});
	}

	private async commitSidebarReorder(fromId: string, toId: string): Promise<void> {
		const type = this.sidebarType;
		if (!this.plugin.settings.sidebarOrder) {
			this.plugin.settings.sidebarOrder = { long: [], temp: [], bug: [] };
		}
		const ofType = this.tasks().filter((t) => t.type === type);
		const saved = this.plugin.settings.sidebarOrder[type] ?? [];
		const next = reorderSidebarIds(mergeSidebarOrder(ofType, saved), fromId, toId);
		this.plugin.settings.sidebarOrder[type] = next;
		await this.plugin.saveSettings();
		this.renderList();
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
			const next = (this.workMode === "board" ? this.sidebarTasks() : this.catalogFiltered())[0]
				?? this.tasks()[0];
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
		const rail = 48;
		const boardMode = board.dataset.mode === "board";
		const w = board.clientWidth;
		const minY = 160;
		const minToday = 220;
		const minList = 200;
		if (w <= 0) {
			board.style.gridTemplateColumns = boardMode
				? `${rail}px minmax(${minY}px, 1.1fr) minmax(${minToday}px, 1.5fr) minmax(${minList}px, 1.3fr)`
				: `${rail}px minmax(0, 1fr)`;
			return;
		}
		if (!boardMode) {
			board.style.gridTemplateColumns = `${rail}px minmax(0, 1fr)`;
			return;
		}
		const avail = Math.max(1, w - rail);
		let yW = Math.round(avail * this.yesterdayPaneRatio);
		let todayW = Math.round(avail * this.todayPaneRatio);
		yW = Math.max(minY, Math.min(Math.floor(avail * 0.32), yW));
		todayW = Math.max(minToday, Math.min(Math.floor(avail * 0.45), todayW));
		let listW = avail - yW - todayW;
		if (listW < minList) {
			const deficit = minList - listW;
			const shrinkToday = Math.min(deficit, Math.max(0, todayW - minToday));
			todayW -= shrinkToday;
			listW = avail - yW - todayW;
			if (listW < minList) {
				const deficit2 = minList - listW;
				yW = Math.max(minY, yW - deficit2);
				listW = avail - yW - todayW;
			}
		}
		board.style.gridTemplateColumns = `${rail}px ${yW}px ${todayW}px ${Math.max(minList, listW)}px`;
	}

	private openTaskDetail(id: string): void {
		if (this.selectedId !== id) {
			this.editingLogDate = null;
			this.editingDesc = false;
			this.editingTitle = false;
		}
		this.selectedId = id;
		this.detailOpen = true;
	}

	private closeDetailDrawer(): void {
		this.detailOpen = false;
		this.editingLogDate = null;
		this.editingDesc = false;
		this.editingTitle = false;
		this.syncDetailDrawer();
		this.renderList();
		if (this.workMode === "list" || this.view === "list") this.renderCatalog();
	}

	private syncDetailDrawer(): void {
		const board = this.contentEl.querySelector("#ztk-view-board") as HTMLElement | null;
		if (!board) return;
		const open = this.detailOpen && !!this.selectedId;
		board.dataset.detailOpen = open ? "1" : "0";
		board.classList.toggle("is-detail-open", open);
		const drawer = board.querySelector(".ztk-detail-drawer");
		if (drawer) drawer.setAttribute("aria-hidden", open ? "false" : "true");
	}

	private syncPeriodVisibility(): void {
		this.$(".ztk-period").classList.toggle(
			"is-hidden",
			this.view === "board"
				|| this.view === "list"
				|| this.view === "detail"
				|| this.view === "cal"
				|| this.view === "web",
		);
		const newBtn = this.contentEl.querySelector<HTMLElement>("[data-act=\"new\"]");
		if (newBtn) {
			newBtn.classList.toggle("is-hidden", this.view === "web");
		}
		const newProjectBtn = this.contentEl.querySelector<HTMLElement>("[data-act=\"new-project\"]");
		if (newProjectBtn) {
			newProjectBtn.classList.toggle("is-hidden", this.view === "web");
		}
	}

	private openModal(): void {
		this.closeProjectModal();
		const form = this.$(".ztk-modal-card") as HTMLFormElement;
		const start = form.elements.namedItem("start") as HTMLInputElement;
		const end = form.elements.namedItem("end") as HTMLInputElement;
		start.value = todayStr();
		end.value = fmt(addDays(new Date(), 14));
		const projectInput = form.elements.namedItem("project") as HTMLInputElement;
		projectInput.value = resolveNewTaskProject(this.projectFilter);
		const list = form.querySelector("#ztk-project-options");
		if (list) {
			list.innerHTML = this.plugin.store.projects
				.map((p) => `<option value="${esc(p)}"></option>`)
				.join("");
		}
		this.$(".ztk-modal:not(.ztk-project-modal)").classList.add("on");
	}

	private closeModal(): void {
		this.$(".ztk-modal:not(.ztk-project-modal)").classList.remove("on");
	}

	private openProjectModal(): void {
		this.closeModal();
		const form = this.$(".ztk-project-modal-card") as HTMLFormElement;
		form.reset();
		this.$(".ztk-project-modal").classList.add("on");
		(form.elements.namedItem("projectName") as HTMLInputElement | null)?.focus();
	}

	private closeProjectModal(): void {
		this.$(".ztk-project-modal").classList.remove("on");
	}

	private async createProject(form: HTMLFormElement): Promise<void> {
		const raw = (form.elements.namedItem("projectName") as HTMLInputElement).value;
		if (!normalizeProjectName(raw)) {
			new Notice("请填写有效项目名（不能是日报/长期/临时/缺陷）");
			return;
		}
		const result = await this.plugin.store.createProject(raw);
		if (!result.ok) {
			new Notice(result.reason);
			return;
		}
		this.projectFilter = result.name;
		this.closeProjectModal();
		this.renderAll();
		new Notice(`已创建项目「${result.name}」`);
	}

	private async createTask(form: HTMLFormElement): Promise<void> {
		const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
		const desc = (form.elements.namedItem("desc") as HTMLTextAreaElement).value.trim();
		const project = (form.elements.namedItem("project") as HTMLInputElement).value.trim()
			|| resolveNewTaskProject(this.projectFilter);
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
			const text = textEl?.value.trim() ?? "";
			const hoursRaw = hoursEl?.value ?? "";
			const hours = parseHoursInput(hoursRaw);
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
			this.selectedId = await this.plugin.store.updateLog(t, date, text, hours);
			this.editingLogDate = null;
			this.renderAll();
			new Notice("已更新进展");
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
		const mode: WorkMode = this.view === "board" ? "board" : "list";
		// 非工作页时仍按 workMode 预渲染，便于切回
		const activeMode = (this.view === "board" || this.view === "list") ? mode : this.workMode;
		board.dataset.mode = activeMode;
		this.renderWorkRail(activeMode);
		if (activeMode === "board") {
			this.renderBoardYesterday();
			this.renderBoardToday();
			this.renderBoardPlan();
			this.renderSidebarChrome();
			this.renderList();
		} else {
			this.renderBoardYesterday(false);
			this.renderBoardToday(false);
			this.renderBoardPlan(false);
			this.renderFilters();
			this.renderCatalog();
		}
	}

	/** 工作台最左：昨日计划（只读） */
	private renderBoardYesterday(show = true): void {
		const box = this.contentEl.querySelector<HTMLElement>(".ztk-board-yesterday");
		if (!box) return;
		if (!show) {
			box.innerHTML = "";
			return;
		}
		const yKey = prevDateStr(todayStr());
		if (this.yesterdayPlanLoadedFor !== yKey) {
			this.yesterdayPlanLoadedFor = yKey;
			void this.refreshYesterdayPlanCache();
		}
		box.innerHTML = yesterdayPlanBlockHtml(this.yesterdayPlanCache);
	}

	/** 工作台中间上：复用汇总页「我的今天」卡片 */
	private renderBoardToday(show = true): void {
		const box = this.contentEl.querySelector<HTMLElement>(".ztk-board-today");
		if (!box) return;
		if (!show) {
			box.innerHTML = "";
			return;
		}
		const today = todayStr();
		const todayLogs = this.logsOn(today, "all");
		box.innerHTML = todayDigestHtml(
			today,
			todayLogs.map((l) => ({
				id: l.task.id,
				title: l.task.title,
				path: l.task.path,
				project: l.task.project,
				hours: l.hours,
			})),
			{ groupByProject: this.plugin.settings.todayGroupByProject === true },
		);
	}

	/** 工作台中间下：明日计划待办 */
	private renderBoardPlan(show = true): void {
		const box = this.contentEl.querySelector<HTMLElement>(".ztk-board-plan");
		if (!box) return;
		if (!show) {
			box.innerHTML = "";
			return;
		}
		const draft = this.syncDailyReportDraft();
		box.innerHTML = `
			<div class="ztk-card ztk-tomorrow-plan">
				<div class="ztk-tomorrow-plan-head">
					<h2>明日计划</h2>
				</div>
				${tomorrowPlanListHtml(draft.planItems)}
			</div>
		`;
	}

	private async refreshYesterdayPlanCache(): Promise<void> {
		try {
			this.yesterdayPlanCache = await this.plugin.store.readYesterdayPlan();
		} catch {
			this.yesterdayPlanCache = { path: null, items: [] };
		}
		if (this.contentEl.querySelector(".ztk-board-yesterday")) {
			this.renderBoardYesterday();
		}
	}

	private async openYesterdayPlan(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice("昨日日报不存在");
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
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
			const yKey = prevDateStr(todayStr());
			if (path && draft.date === yKey) {
				this.yesterdayPlanLoadedFor = "";
				if (this.contentEl.querySelector(".ztk-board-yesterday")) {
					this.renderBoardYesterday();
				}
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
		if (this.view === "board" || this.workMode === "board") this.renderBoardPlan();
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

	private renderWorkRail(mode: WorkMode = this.workMode): void {
		this.contentEl.querySelectorAll<HTMLButtonElement>(".ztk-work-rail [data-work-mode]").forEach((b) => {
			b.classList.toggle("on", b.dataset.workMode === mode);
		});
	}

	private filterBarHtml(extra = ""): string {
		return `
			<button class="ztk-chip ${this.typeFilter === "all" ? "on" : ""}" data-k="all" type="button">全部</button>
			<button class="ztk-chip ${this.typeFilter === "long" ? "on" : ""}" data-k="long" type="button">长期</button>
			<button class="ztk-chip ${this.typeFilter === "temp" ? "on" : ""}" data-k="temp" type="button">临时</button>
			<button class="ztk-chip ${this.typeFilter === "bug" ? "on" : ""}" data-k="bug" type="button">缺陷</button>
			<select class="ztk-status-filter">
				<option value="all">全部状态</option>
				<option value="todo">未开始</option>
				<option value="doing">进行中</option>
				<option value="done">已完结</option>
			</select>
			${extra}
		`;
	}

	private renderSidebarChrome(): void {
		this.$(".ztk-filters").innerHTML = `
			<div class="ztk-side-filters">
				<select class="ztk-side-type" aria-label="类型筛选">
					<option value="long">长期</option>
					<option value="temp">临时</option>
					<option value="bug">缺陷</option>
				</select>
				<select class="ztk-side-status" aria-label="状态筛选">
					<option value="all">全部状态</option>
					<option value="todo">未开始</option>
					<option value="doing">进行中</option>
					<option value="done">已完结</option>
					<option value="!done">不包括已完结</option>
					<option value="!todo">不包括未开始</option>
					<option value="!doing">不包括进行中</option>
				</select>
			</div>
		`;
		const type = this.contentEl.querySelector<HTMLSelectElement>(".ztk-side-type");
		const status = this.contentEl.querySelector<HTMLSelectElement>(".ztk-side-status");
		if (type) type.value = this.sidebarType;
		if (status) status.value = this.sidebarStatus;
	}

	private renderFilters(): void {
		this.$(".ztk-filters").innerHTML = this.filterBarHtml(
			`<input class="ztk-search" type="search" placeholder="搜索标题或说明" value="${esc(this.query)}" />
			<span class="ztk-catalog-count">${this.catalogFiltered().length} / ${this.projectTasks().length}</span>`,
		);
		this.contentEl.querySelectorAll<HTMLSelectElement>(".ztk-status-filter").forEach((el) => {
			el.value = this.statusFilter;
		});
	}

	private renderList(): void {
		const today = todayStr();
		const items = this.sidebarTasks();
		const cards = items.map((t) => {
			const need = t.status === "doing" && !t.logs.some((l) => l.date === today);
			return `<div class="ztk-task ${t.id === this.selectedId && this.detailOpen ? "sel" : ""}" data-id="${esc(t.id)}">
				<button type="button" class="ztk-drag-handle" draggable="true" title="拖动排序" aria-label="拖动排序">⠿</button>
				<div class="ztk-rail ${t.type}"></div>
				<div class="ztk-task-main">
					<h3>${esc(t.title)}</h3>
					<div class="ztk-meta">
						${projectBadgeHtml(t.project)}
						<span class="ztk-st ${t.status}">${STATUS_LABEL[t.status]}</span>
						<span>${esc(t.start)} → ${esc(t.end)}</span>
						<span>${t.logs.length} 笔</span>
					</div>
				</div>
				<div class="ztk-task-trail">
					${need ? `<div class="ztk-need" title="今天还没记"></div>` : ""}
					<button type="button" class="ztk-task-del" data-act="del-task" data-id="${esc(t.id)}" title="删除任务" aria-label="删除任务">×</button>
				</div>
			</div>`;
		}).join("");
		this.$(".ztk-task-list").innerHTML = cards
			|| `<p class="ztk-empty">${TYPE_LABEL[this.sidebarType]}里没有符合筛选的任务</p>`;
	}

	private renderCatalog(): void {
		const items = this.catalogFiltered();
		const rows = items.map((t) => `
			<tr data-act="goto-task" data-id="${esc(t.id)}" class="${t.id === this.selectedId && this.detailOpen ? "sel" : ""}">
				<td><span class="ztk-rail-dot ${t.type}"></span>${esc(t.title)}</td>
				<td>${projectBadgeHtml(t.project)}</td>
				<td>${TYPE_LABEL[t.type]}</td>
				<td><span class="ztk-st ${t.status}">${STATUS_LABEL[t.status]}</span></td>
				<td>${esc(t.start)} → ${esc(t.end)}</td>
				<td>${t.logs.length} 笔</td>
				<td class="ztk-catalog-actions">
					<button type="button" class="ztk-task-del" data-act="del-task" data-id="${esc(t.id)}" title="删除任务" aria-label="删除任务">×</button>
				</td>
			</tr>
		`).join("");
		this.$(".ztk-catalog-body").innerHTML = `
			<table>
				<thead>
					<tr><th>标题</th><th>项目</th><th>类型</th><th>状态</th><th>周期</th><th>进展</th><th></th></tr>
				</thead>
				<tbody>
					${rows || `<tr><td colspan="7">没有匹配的任务</td></tr>`}
				</tbody>
			</table>
		`;
		const count = this.contentEl.querySelector(".ztk-catalog-count");
		if (count) count.textContent = `${items.length} / ${this.projectTasks().length}`;
	}

	private activeDetail(): HTMLElement {
		return this.$("#ztk-view-board .ztk-detail");
	}

	private renderDetail(): void {
		const el = this.activeDetail();
		if (!this.detailOpen || !this.selectedId) {
			el.innerHTML = "";
			return;
		}
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
		el.innerHTML = `
			<div class="ztk-detail-head">
				<div class="ztk-detail-head-top">
					<div class="ztk-title-block">
						${this.editingTitle
							? `<div class="ztk-title-edit">
									<input id="ztk-title-input" class="ztk-title-input" value="${esc(t.title)}" />
									<div class="ztk-title-edit-actions">
										${iconBtn("cancel-title", "cancel", "取消")}
										${iconBtn("save-title", "save", "保存")}
									</div>
								</div>`
							: `<h1 class="ztk-detail-title" title="右键可修改标题">${esc(t.title)}</h1>`}
						<div class="ztk-kicker">${esc(t.path)}</div>
					</div>
					<button type="button" class="ztk-ghost ztk-detail-close" data-act="close-detail" title="关闭" aria-label="关闭">×</button>
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
			return `<div class="ztk-log" data-date="${esc(log.date)}">
				<div class="ztk-log-when"><time>${esc(log.date)}</time>${badge}</div>
				<div class="ztk-log-body">
					<label class="ztk-hours-field">工时 (h)
						<input class="ztk-log-hours-edit" type="number" min="0.1" step="0.1" inputmode="decimal" value="${esc(hoursVal)}" />
					</label>
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
		this.$(".ztk-day-pane").innerHTML = `
			<div class="ztk-day-pane-head">
				<h2>${this.selectedDay}${esc(paneHours)}</h2>
				<button class="ztk-ghost ztk-cal-day-toggle" data-act="toggle-cal-day" type="button" title="${collapsed ? "展开详情" : "折叠详情"}">${collapsed ? "›" : "‹"}</button>
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

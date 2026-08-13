import { Component, ItemView, MarkdownRenderer, Notice, type WorkspaceLeaf } from "obsidian";
import type ZTaskingPlugin from "./main";
import {
	STATUS_LABEL,
	TYPE_LABEL,
	VIEW_TYPE,
	addDays,
	daysBetween,
	esc,
	fmt,
	parseDate,
	todayStr,
	type Task,
	type TaskStatus,
	type TaskType,
} from "./model";
import { descBlockHtml } from "./desc";
import { mdSlotHtml, reportLogRowHtml, todayDigestHtml } from "./report";
import { pickSidebarTasks } from "./sidebar";

type Period = "week" | "month" | "quarter" | "year";
type BoardView = "board" | "list" | "detail" | "cal" | "gantt" | "report";
const VIEWS: BoardView[] = ["board", "list", "detail", "cal", "gantt", "report"];
const SIDEBAR_LIMIT = 5; // 长期、临时各自上限

export class ZTaskingView extends ItemView {
	plugin: ZTaskingPlugin;
	view: BoardView = "board";
	period: Period = "week";
	typeFilter: "all" | TaskType = "all";
	statusFilter: "all" | TaskStatus = "all";
	query = "";
	selectedId = "";
	calCursor = new Date();
	selectedDay = todayStr();
	ganttTaskId = "";
	editingLogDate: string | null = null;
	editingDesc = false;
	private mdRoot = new Component();
	private mdGen = 0;

	constructor(leaf: WorkspaceLeaf, plugin: ZTaskingPlugin) {
		super(leaf);
		this.plugin = plugin;
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
		await this.plugin.store.reload();
		this.selectedId = this.plugin.store.tasks[0]?.id ?? "";
		this.contentEl.empty();
		this.contentEl.addClass("ztk-view");
		this.contentEl.innerHTML = `
			<header class="ztk-header">
				<div class="ztk-brand">Z-TASKING<span>任务台</span></div>
				<div class="ztk-tabs">
					<button data-view="board" class="on">工作台</button>
					<button data-view="list">列表</button>
					<button data-view="cal">日历</button>
					<button data-view="gantt">甘特图</button>
					<button data-view="report">汇总</button>
				</div>
				<div class="ztk-spacer"></div>
				<div class="ztk-period">
					<button data-p="week" class="on">周</button>
					<button data-p="month">月</button>
					<button data-p="quarter">季</button>
					<button data-p="year">年</button>
				</div>
				<button class="ztk-btn" data-act="new">新建任务</button>
			</header>
			<main class="ztk-main">
				<div class="ztk-page on" id="ztk-view-board">
					<aside class="ztk-list">
						<div class="ztk-filters"></div>
						<div class="ztk-task-list"></div>
					</aside>
					<article class="ztk-detail"></article>
				</div>
				<div class="ztk-page" id="ztk-view-list">
					<div class="ztk-catalog-bar"></div>
					<div class="ztk-catalog-body"></div>
				</div>
				<div class="ztk-page" id="ztk-view-detail">
					<article class="ztk-detail"></article>
				</div>
				<div class="ztk-page" id="ztk-view-cal">
					<div class="ztk-cal-grid">
						<div class="ztk-cal-toolbar">
							<button class="ztk-ghost" data-act="cal-prev">上一月</button>
							<strong class="ztk-cal-title"></strong>
							<button class="ztk-ghost" data-act="cal-next">下一月</button>
							<button class="ztk-ghost" data-act="cal-today">今天</button>
						</div>
						<div class="ztk-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
						<div class="ztk-days"></div>
					</div>
					<aside class="ztk-day-pane"></aside>
				</div>
				<div class="ztk-page" id="ztk-view-gantt">
					<div class="ztk-gantt-hint"></div>
					<div class="ztk-gantt-pane"></div>
					<div class="ztk-gantt-logs"></div>
				</div>
				<div class="ztk-page" id="ztk-view-report"></div>
			</main>
			<div class="ztk-modal">
				<form class="ztk-modal-card">
					<h2>新建任务</h2>
					<div class="ztk-form">
						<input name="title" required placeholder="任务标题" />
						<textarea name="desc" placeholder="说明：这件事项要达成什么"></textarea>
						<div class="ztk-two">
							<select name="type">
								<option value="long">长期任务</option>
								<option value="temp">临时任务</option>
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
		this.renderAll();
	}

	async onClose(): Promise<void> {
		this.mdRoot.unload();
	}

	async refresh(): Promise<void> {
		await this.plugin.store.reload();
		if (!this.plugin.store.tasks.some((t) => t.id === this.selectedId)) {
			this.selectedId = this.plugin.store.tasks[0]?.id ?? "";
		}
		this.renderAll();
	}

	private tasks(): Task[] {
		return this.plugin.store.tasks;
	}

	private $(sel: string): HTMLElement {
		const el = this.contentEl.querySelector(sel);
		if (!el) throw new Error(`missing ${sel}`);
		return el as HTMLElement;
	}

	private periodRange(): { start: Date; end: Date; label: string } {
		const t = parseDate(todayStr());
		if (this.period === "week") {
			const day = (t.getDay() + 6) % 7;
			const start = addDays(t, -day);
			return { start, end: addDays(start, 6), label: "本周" };
		}
		if (this.period === "month") {
			return {
				start: new Date(t.getFullYear(), t.getMonth(), 1),
				end: new Date(t.getFullYear(), t.getMonth() + 1, 0),
				label: "本月",
			};
		}
		if (this.period === "quarter") {
			const q = Math.floor(t.getMonth() / 3) * 3;
			return {
				start: new Date(t.getFullYear(), q, 1),
				end: new Date(t.getFullYear(), q + 3, 0),
				label: "本季",
			};
		}
		return {
			start: new Date(t.getFullYear(), 0, 1),
			end: new Date(t.getFullYear(), 11, 31),
			label: "今年",
		};
	}

	private inRange(date: string, range: { start: Date; end: Date }): boolean {
		if (!date) return false;
		const d = parseDate(date);
		return d >= range.start && d <= range.end;
	}

	private filtered(): Task[] {
		return this.tasks().filter((t) =>
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

	private sidebarTasks(type: TaskType): Task[] {
		return pickSidebarTasks(this.filtered(), type, this.selectedId, todayStr(), SIDEBAR_LIMIT);
	}

	private switchView(view: BoardView): void {
		this.view = view;
		const tabView = view === "detail" ? "list" : view;
		this.contentEl.querySelectorAll(".ztk-tabs button").forEach((b) =>
			b.classList.toggle("on", (b as HTMLElement).dataset.view === tabView));
		for (const v of VIEWS) {
			this.contentEl.querySelector(`#ztk-view-${v}`)?.classList.toggle("on", v === view);
		}
		this.syncPeriodVisibility();
	}

	private logsInPeriod() {
		const r = this.periodRange();
		return this.tasks().flatMap((t) => t.logs.filter((l) => this.inRange(l.date, r)).map((l) => ({ ...l, task: t })));
	}

	private logsOn(day: string) {
		return this.tasks().flatMap((t) => t.logs.filter((l) => l.date === day).map((l) => ({ ...l, task: t })));
	}

	private bind(): void {
		const root = this.contentEl;
		root.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			const mdLink = target.closest<HTMLAnchorElement>("a.internal-link");
			const mdHost = target.closest<HTMLElement>(".ztk-md");
			if (mdLink && mdHost) {
				e.preventDefault();
				const href = mdLink.dataset.href || mdLink.getAttribute("href") || "";
				if (href) void this.app.workspace.openLinkText(href, mdHost.dataset.src || "");
				return;
			}
			const tab = target.closest<HTMLButtonElement>(".ztk-tabs button");
			if (tab?.dataset.view) {
				this.switchView(tab.dataset.view as BoardView);
				return;
			}
			const p = target.closest<HTMLButtonElement>(".ztk-period button");
			if (p?.dataset.p) {
				this.period = p.dataset.p as Period;
				root.querySelectorAll(".ztk-period button").forEach((b) => b.classList.toggle("on", b === p));
				this.mdGen += 1;
				const gen = this.mdGen;
				this.renderGantt();
				this.renderReport();
				void this.paintMarkdown(gen);
				return;
			}
			const act = target.closest<HTMLElement>("[data-act]");
			if (act?.dataset.act) {
				const a = act.dataset.act;
				if (a === "new") this.openModal();
				if (a === "cancel") this.closeModal();
				if (a === "cal-prev") {
					this.calCursor.setMonth(this.calCursor.getMonth() - 1);
					this.renderCalendar();
				}
				if (a === "cal-next") {
					this.calCursor.setMonth(this.calCursor.getMonth() + 1);
					this.renderCalendar();
				}
				if (a === "cal-today") {
					this.calCursor = new Date();
					this.selectedDay = todayStr();
					this.renderCalendar();
				}
				if (a === "add-log") void this.addTodayLog();
				if (a === "edit-log" || a === "save-log" || a === "cancel-log" || a === "del-log") {
					const date = act.closest<HTMLElement>("[data-date]")?.dataset.date;
					if (date) void this.handleLogAction(a, date);
					return;
				}
				if (a === "edit-desc" || a === "save-desc" || a === "cancel-desc") {
					void this.handleDescAction(a);
					return;
				}
				if (a === "goto-task" && act.dataset.id) {
					this.selectedId = act.dataset.id;
					this.editingLogDate = null;
					this.editingDesc = false;
					this.switchView("detail");
					this.renderAll();
				}
				if (a === "back-list" || a === "open-list") {
					this.switchView("list");
					this.renderAll();
				}
				return;
			}
			const chip = target.closest<HTMLElement>(".ztk-chip");
			if (chip?.dataset.k) {
				this.typeFilter = chip.dataset.k as "all" | TaskType;
				this.renderAll();
				return;
			}
			const taskEl = target.closest<HTMLElement>(".ztk-task");
			if (taskEl?.dataset.id) {
				if (this.selectedId !== taskEl.dataset.id) {
					this.editingLogDate = null;
					this.editingDesc = false;
				}
				this.selectedId = taskEl.dataset.id;
				this.renderAll();
				return;
			}
			const day = target.closest<HTMLElement>(".ztk-day");
			if (day?.dataset.day) {
				this.selectedDay = day.dataset.day;
				this.renderCalendar();
				return;
			}
			const grow = target.closest<HTMLElement>("[data-gid]");
			if (grow?.dataset.gid) {
				this.ganttTaskId = grow.dataset.gid;
				this.renderGantt();
			}
		});
		root.addEventListener("change", (e) => {
			const el = e.target as HTMLElement;
			if (el.classList.contains("ztk-status-filter")) {
				this.statusFilter = (el as HTMLSelectElement).value as "all" | TaskStatus;
				this.renderAll();
			}
			if (el.id === "ztk-task-status") {
				void this.changeStatus((el as HTMLSelectElement).value as TaskStatus);
			}
		});
		root.addEventListener("input", (e) => {
			const el = e.target as HTMLElement;
			if (el.classList.contains("ztk-search")) {
				this.query = (el as HTMLInputElement).value;
				this.renderCatalog();
			}
		});
		this.$(".ztk-modal-card").addEventListener("submit", (e) => {
			e.preventDefault();
			void this.createTask(e.target as HTMLFormElement);
		});
	}

	private syncPeriodVisibility(): void {
		this.$(".ztk-period").classList.toggle(
			"is-hidden",
			this.view === "board" || this.view === "list" || this.view === "detail" || this.view === "cal",
		);
	}

	private openModal(): void {
		const form = this.$(".ztk-modal-card") as HTMLFormElement;
		const start = form.elements.namedItem("start") as HTMLInputElement;
		const end = form.elements.namedItem("end") as HTMLInputElement;
		start.value = todayStr();
		end.value = fmt(addDays(new Date(), 14));
		this.$(".ztk-modal").classList.add("on");
	}

	private closeModal(): void {
		this.$(".ztk-modal").classList.remove("on");
	}

	private async createTask(form: HTMLFormElement): Promise<void> {
		const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
		const desc = (form.elements.namedItem("desc") as HTMLTextAreaElement).value.trim();
		const type = (form.elements.namedItem("type") as HTMLSelectElement).value as TaskType;
		const status = (form.elements.namedItem("status") as HTMLSelectElement).value as TaskStatus;
		const start = (form.elements.namedItem("start") as HTMLInputElement).value;
		const end = (form.elements.namedItem("end") as HTMLInputElement).value;
		const task = await this.plugin.store.create({ title, desc, type, status, start, end });
		this.selectedId = task.id;
		this.switchView("board");
		this.closeModal();
		form.reset();
		this.renderAll();
		new Notice(`已创建笔记 ${task.path}`);
	}

	private async addTodayLog(): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		const text = (this.contentEl.querySelector("#ztk-log-text") as HTMLTextAreaElement | null)?.value.trim();
		if (!t || !text) return;
		await this.plugin.store.addLog(t, todayStr(), text);
		this.renderAll();
		new Notice("已写入今日进展");
	}

	private async changeStatus(status: TaskStatus): Promise<void> {
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t || t.status === status) return;
		await this.plugin.store.setStatus(t, status);
		this.renderAll();
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
			await this.plugin.store.setDesc(t, desc);
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
			const box = this.contentEl.querySelector(`.ztk-log[data-date="${CSS.escape(date)}"] textarea`) as HTMLTextAreaElement | null;
			const text = box?.value.trim() ?? "";
			if (!text) {
				new Notice("进展内容不能为空");
				return;
			}
			await this.plugin.store.updateLog(t, date, text);
			this.editingLogDate = null;
			this.renderAll();
			new Notice("已更新进展");
			return;
		}
		if (act === "del-log") {
			if (!confirm(`删除 ${date} 这条进展？`)) return;
			await this.plugin.store.deleteLog(t, date);
			if (this.editingLogDate === date) this.editingLogDate = null;
			this.renderAll();
			new Notice("已删除进展");
		}
	}

	renderAll(): void {
		this.mdGen += 1;
		const gen = this.mdGen;
		this.syncPeriodVisibility();
		this.renderFilters();
		this.renderList();
		this.renderCatalog();
		this.renderDetail();
		this.renderCalendar();
		this.renderGantt();
		this.renderReport();
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
		this.mdRoot.unload();
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
	}

	private filterBarHtml(extra = ""): string {
		return `
			<button class="ztk-chip ${this.typeFilter === "all" ? "on" : ""}" data-k="all">全部</button>
			<button class="ztk-chip ${this.typeFilter === "long" ? "on" : ""}" data-k="long">长期</button>
			<button class="ztk-chip ${this.typeFilter === "temp" ? "on" : ""}" data-k="temp">临时</button>
			<select class="ztk-status-filter">
				<option value="all">全部状态</option>
				<option value="todo">未开始</option>
				<option value="doing">进行中</option>
				<option value="done">已完结</option>
			</select>
			${extra}
		`;
	}

	private renderFilters(): void {
		this.$(".ztk-filters").innerHTML = this.filterBarHtml();
		this.$(".ztk-catalog-bar").innerHTML = this.filterBarHtml(
			`<input class="ztk-search" type="search" placeholder="搜索标题或说明" value="${esc(this.query)}" />
			<span class="ztk-catalog-count">${this.catalogFiltered().length} / ${this.tasks().length}</span>`,
		);
		this.contentEl.querySelectorAll<HTMLSelectElement>(".ztk-status-filter").forEach((el) => {
			el.value = this.statusFilter;
		});
	}

	private renderCatalog(): void {
		const items = this.catalogFiltered();
		const rows = items.map((t) => `
			<tr data-act="goto-task" data-id="${esc(t.id)}">
				<td><span class="ztk-rail-dot ${t.type}"></span>${esc(t.title)}</td>
				<td>${TYPE_LABEL[t.type]}</td>
				<td><span class="ztk-st ${t.status}">${STATUS_LABEL[t.status]}</span></td>
				<td>${esc(t.start)} → ${esc(t.end)}</td>
				<td>${t.logs.length} 笔</td>
			</tr>
		`).join("");
		this.$(".ztk-catalog-body").innerHTML = `
			<table>
				<thead>
					<tr><th>标题</th><th>类型</th><th>状态</th><th>周期</th><th>进展</th></tr>
				</thead>
				<tbody>
					${rows || `<tr><td colspan="5">没有匹配的任务</td></tr>`}
				</tbody>
			</table>
		`;
		const count = this.contentEl.querySelector(".ztk-catalog-count");
		if (count) count.textContent = `${items.length} / ${this.tasks().length}`;
	}

	private renderList(): void {
		const today = todayStr();
		const html = (["long", "temp"] as TaskType[]).map((key) => {
			const all = this.filtered().filter((t) => t.type === key);
			const items = this.sidebarTasks(key);
			if (!all.length) return "";
			const hidden = all.length - items.length;
			const cards = items.map((t) => {
				const need = t.status === "doing" && !t.logs.some((l) => l.date === today);
				return `<div class="ztk-task ${t.id === this.selectedId ? "sel" : ""}" data-id="${esc(t.id)}">
					<div class="ztk-rail ${t.type}"></div>
					<div>
						<h3>${esc(t.title)}</h3>
						<div class="ztk-meta">
							<span class="ztk-st ${t.status}">${STATUS_LABEL[t.status]}</span>
							<span>${esc(t.start)} → ${esc(t.end)}</span>
							<span>${t.logs.length} 笔</span>
						</div>
					</div>
					${need ? `<div class="ztk-need" title="今天还没记"></div>` : ""}
				</div>`;
			}).join("");
			const more = hidden
				? `<button class="ztk-more" data-act="open-list" type="button">还有 ${hidden} 条${TYPE_LABEL[key]}，打开列表</button>`
				: "";
			return `<div class="ztk-group">${TYPE_LABEL[key]}任务 · ${all.length}</div>${cards}${more}`;
		}).join("");
		this.$(".ztk-task-list").innerHTML = html || `<p class="ztk-empty">还没有任务，点右上角新建。笔记会写到 ${esc(this.plugin.settings.rootFolder)}/</p>`;
	}

	private activeDetail(): HTMLElement {
		return this.view === "detail"
			? this.$("#ztk-view-detail .ztk-detail")
			: this.$("#ztk-view-board .ztk-detail");
	}

	private renderDetail(): void {
		const boardEl = this.$("#ztk-view-board .ztk-detail");
		const soloEl = this.$("#ztk-view-detail .ztk-detail");
		const el = this.activeDetail();
		(el === boardEl ? soloEl : boardEl).innerHTML = "";
		const t = this.tasks().find((x) => x.id === this.selectedId);
		if (!t) {
			el.innerHTML = `<div class="ztk-empty">选一条任务，在这里写今天的进展</div>`;
			return;
		}
		const logs = [...t.logs].sort((a, b) => b.date.localeCompare(a.date));
		el.innerHTML = `
			${this.view === "detail" ? `<button class="ztk-ghost ztk-back" data-act="back-list" type="button">返回列表</button>` : ""}
			<div class="ztk-kicker">${TYPE_LABEL[t.type]} · ${esc(t.start)} → ${esc(t.end)} · ${esc(t.path)}</div>
			<div class="ztk-detail-head">
				<h1>${esc(t.title)}</h1>
				<div class="ztk-status-box">
					<label>状态</label>
					<select id="ztk-task-status">
						<option value="todo">未开始</option>
						<option value="doing">进行中</option>
						<option value="done">已完结</option>
					</select>
				</div>
			</div>
			<div class="ztk-meta"><span>${t.logs.length} 条进展</span></div>
			${descBlockHtml({ editing: this.editingDesc, desc: t.desc, path: t.path })}
			<div class="ztk-composer">
				<label>记今天 · ${todayStr()}</label>
				<textarea id="ztk-log-text" placeholder="支持 Markdown：列表、加粗、链接、[[笔记]]"></textarea>
				<div class="ztk-composer-row">
					<button class="ztk-btn" data-act="add-log" type="button">记一笔</button>
				</div>
			</div>
			<div>
				${logs.map((l) => this.logRowHtml(l.date, l.text, t.path)).join("") || `<p class="ztk-muted">还没有进展，从上面记第一笔。</p>`}
			</div>
		`;
		(this.$("#ztk-task-status") as HTMLSelectElement).value = t.status;
	}

	private logRowHtml(date: string, text: string, path: string): string {
		if (this.editingLogDate === date) {
			return `<div class="ztk-log" data-date="${esc(date)}">
				<time>${esc(date)}</time>
				<div class="ztk-log-body"><textarea class="ztk-log-edit">${esc(text)}</textarea></div>
				<div class="ztk-log-actions">
					<button class="ztk-btn" data-act="save-log" type="button">保存</button>
					<button class="ztk-ghost" data-act="cancel-log" type="button">取消</button>
				</div>
			</div>`;
		}
		return `<div class="ztk-log" data-date="${esc(date)}">
			<time>${esc(date)}</time>
			<div class="ztk-log-body">${this.mdSlot(path, date)}</div>
			<div class="ztk-log-actions">
				<button class="ztk-ghost" data-act="edit-log" type="button">编辑</button>
				<button class="ztk-btn-danger" data-act="del-log" type="button">删除</button>
			</div>
		</div>`;
	}

	private renderCalendar(): void {
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
			const cls = [
				"ztk-day",
				d.getMonth() !== m ? "out" : "",
				key === todayStr() ? "today" : "",
				key === this.selectedDay ? "sel" : "",
			].join(" ");
			const items = logs.slice(0, 3).map((l) => `<div class="ztk-day-item">${esc(l.task.title)}</div>`).join("");
			const more = logs.length > 3 ? `<div class="ztk-day-item">+${logs.length - 3}</div>` : "";
			html += `<div class="${cls}" data-day="${key}"><div class="ztk-day-num">${d.getDate()}</div>${items}${more}</div>`;
		}
		this.$(".ztk-days").innerHTML = html;
		const dayLogs = this.logsOn(this.selectedDay);
		this.$(".ztk-day-pane").innerHTML = `<h2>${this.selectedDay}</h2>` + (dayLogs.length
			? dayLogs.map((l) => `<div class="ztk-log"><time><button class="ztk-ghost" data-act="goto-task" data-id="${esc(l.task.id)}">${esc(l.task.title)}</button></time><div class="ztk-log-body">${this.mdSlot(l.task.path, l.date)}</div></div>`).join("")
			: `<p class="ztk-muted">这天还没有进展记录</p>`);
	}

	private ganttUnits(range: { start: Date; end: Date }) {
		const units: { start: Date; end: Date; label: string }[] = [];
		if (this.period === "week" || this.period === "month") {
			for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) {
				units.push({ start: new Date(d), end: new Date(d), label: String(d.getDate()) });
			}
		} else if (this.period === "quarter") {
			let d = new Date(range.start);
			d = addDays(d, -((d.getDay() + 6) % 7));
			while (d <= range.end) {
				units.push({ start: new Date(d), end: addDays(d, 6), label: `${d.getMonth() + 1}/${d.getDate()}` });
				d = addDays(d, 7);
			}
		} else {
			for (let m = 0; m < 12; m++) {
				units.push({
					start: new Date(range.start.getFullYear(), m, 1),
					end: new Date(range.start.getFullYear(), m + 1, 0),
					label: `${m + 1}月`,
				});
			}
		}
		return units;
	}

	private renderGantt(): void {
		const r = this.periodRange();
		const units = this.ganttUnits(r);
		const hint = { week: "按天看本周", month: "按天看本月", quarter: "按周看本季", year: "按月看今年" }[this.period];
		this.$(".ztk-gantt-hint").textContent = `${fmt(r.start)} 至 ${fmt(r.end)} · ${hint}`;
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
					const ts = parseDate(t.start || fmt(r.start));
					const te = parseDate(t.end || fmt(r.end));
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
		const todayLogs = this.logsOn(today);
		const logs = this.logsInPeriod().sort((a, b) => b.date.localeCompare(a.date));
		const byTask: Record<string, number> = {};
		for (const l of logs) byTask[l.task.title] = (byTask[l.task.title] ?? 0) + 1;
		const countByDay: Record<string, number> = {};
		for (const l of logs) countByDay[l.date] = (countByDay[l.date] ?? 0) + 1;
		const heatDays = daysBetween(r.start, r.end) + 1;
		let heat = "";
		for (let i = 0; i < Math.min(heatDays, 370); i++) {
			const d = fmt(addDays(r.start, i));
			const n = countByDay[d] ?? 0;
			heat += `<i class="${n >= 3 ? "l3" : n === 2 ? "l2" : n === 1 ? "l1" : ""}" title="${d} · ${n} 笔"></i>`;
		}
		this.$("#ztk-view-report").innerHTML = `
			${todayDigestHtml(today, todayLogs.map((l) => ({ id: l.task.id, title: l.task.title, path: l.task.path })))}
			<div class="ztk-card">
				<h2>${r.label}进展明细</h2>
				<table>
					<thead><tr><th>日期</th><th>任务</th><th>做了什么</th></tr></thead>
					<tbody>${logs.map((l) => reportLogRowHtml({ date: l.date, title: l.task.title, path: l.task.path })).join("") || `<tr><td colspan="3">这个周期还没有记录</td></tr>`}</tbody>
				</table>
			</div>
			<div>
				<div class="ztk-card" style="margin-bottom:12px"><h2>活跃分布</h2><div class="ztk-heat">${heat}</div></div>
				<div class="ztk-card"><h2>按任务计数</h2><table>${Object.entries(byTask).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v} 笔</td></tr>`).join("") || "<tr><td>暂无</td></tr>"}</table></div>
			</div>
		`;
	}
}

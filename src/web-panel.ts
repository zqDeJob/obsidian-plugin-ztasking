import { Modal, Notice, Platform } from "obsidian";
import type ZTaskingPlugin from "./main";
import { esc, type WebBookmark } from "./model";

const PARTITION = "persist:z-tasking-web";

function newId(): string {
	return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeUrl(raw: string): string {
	const t = raw.trim();
	if (!t) return "";
	if (/^https?:\/\//i.test(t)) return t;
	return `https://${t}`;
}

function hostOf(url: string): string {
	try {
		return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function initialOf(title: string, url: string): string {
	const t = title.trim();
	if (t) return t.slice(0, 1).toUpperCase();
	const h = hostOf(url);
	return (h.slice(0, 1) || "?").toUpperCase();
}

class AddBookmarkModal extends Modal {
	private plugin: ZTaskingPlugin;
	private onDone: (bm: WebBookmark) => void;
	private titleVal = "";
	private urlVal = "https://";

	constructor(plugin: ZTaskingPlugin, onDone: (bm: WebBookmark) => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.onDone = onDone;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("ztk-bm-modal");
		contentEl.empty();
		contentEl.addClass("ztk-bm-modal-body");

		contentEl.createDiv({ cls: "ztk-bm-modal-eyebrow", text: "常见网页" });
		contentEl.createEl("h2", { text: "添加书签" });
		contentEl.createEl("p", {
			cls: "ztk-bm-modal-lead",
			text: "名称随便写；网址可省略 https://",
		});

		const form = contentEl.createDiv({ cls: "ztk-bm-form" });

		const nameField = form.createDiv({ cls: "ztk-bm-field" });
		nameField.createEl("label", { text: "名称" });
		const nameInput = nameField.createEl("input", {
			type: "text",
			cls: "ztk-bm-input",
			placeholder: "例如 公司 Wiki",
		});
		nameInput.value = this.titleVal;
		nameInput.addEventListener("input", () => {
			this.titleVal = nameInput.value;
		});

		const urlField = form.createDiv({ cls: "ztk-bm-field" });
		urlField.createEl("label", { text: "网址" });
		const urlInput = urlField.createEl("input", {
			type: "url",
			cls: "ztk-bm-input",
			placeholder: "example.com 或 https://…",
		});
		urlInput.value = this.urlVal;
		urlInput.addEventListener("input", () => {
			this.urlVal = urlInput.value;
		});
		urlInput.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
				this.submit();
			}
		});

		const actions = contentEl.createDiv({ cls: "ztk-bm-modal-actions" });
		const cancel = actions.createEl("button", { type: "button", cls: "ztk-ghost", text: "取消" });
		cancel.addEventListener("click", () => this.close());
		const ok = actions.createEl("button", { type: "button", cls: "ztk-btn", text: "添加书签" });
		ok.addEventListener("click", () => this.submit());

		window.setTimeout(() => nameInput.focus(), 30);
	}

	private submit(): void {
		const url = normalizeUrl(this.urlVal);
		if (!url || url === "https://") {
			new Notice("请填写有效网址");
			return;
		}
		const bm: WebBookmark = {
			id: newId(),
			title: this.titleVal.trim() || hostOf(url) || url,
			url,
		};
		this.close();
		this.onDone(bm);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

type WebviewEl = HTMLElement & {
	src: string;
	getURL?: () => string;
	loadURL?: (url: string) => unknown;
	reload?: () => void;
	goBack?: () => void;
};

/** 常见网页：书签 + 内嵌 webview（持久化登录态分区） */
export class WebPanel {
	private plugin: ZTaskingPlugin;
	private host: HTMLElement | null = null;
	private activeId = "";
	/** 每个书签一个常驻 webview，切页只切可见性，页面不会重新加载 */
	private views = new Map<string, WebviewEl>();
	private shellReady = false;

	constructor(plugin: ZTaskingPlugin) {
		this.plugin = plugin;
	}

	mount(host: HTMLElement): void {
		if (!Array.isArray(this.plugin.settings.webBookmarks)) {
			this.plugin.settings.webBookmarks = [];
		}
		// 外壳只建一次：重建 DOM 会销毁 webview，导致每次切页都重新加载
		if (this.host === host && this.shellReady) {
			this.renderBookmarks();
			return;
		}
		this.host = host;
		this.views.clear();
		this.shellReady = false;
		this.render();
	}

	destroy(): void {
		this.views.clear();
		this.shellReady = false;
		this.host = null;
	}

	render(): void {
		if (!this.host) return;
		if (!Platform.isDesktopApp) {
			this.host.innerHTML = `<div class="ztk-empty">网页模块仅支持桌面端 Obsidian。</div>`;
			return;
		}
		this.host.innerHTML = `
			<aside class="ztk-web-side">
				<div class="ztk-web-side-head">
					<span class="ztk-web-side-label">书签</span>
					<div class="ztk-web-side-actions">
						<button class="ztk-web-side-btn" type="button" data-web-act="add" title="添加书签">＋</button>
						<button class="ztk-web-side-btn ztk-web-collapse" type="button" data-web-act="toggle-side"></button>
					</div>
				</div>
				<div class="ztk-web-bookmarks"></div>
				<p class="ztk-web-hint">内嵌 Chromium · 登录态持久保存</p>
			</aside>
			<section class="ztk-web-main">
				<div class="ztk-web-toolbar">
					<button class="ztk-web-tool" type="button" data-web-act="back" title="后退">←</button>
					<button class="ztk-web-tool" type="button" data-web-act="reload" title="刷新">↻</button>
					<input class="ztk-web-url" type="url" placeholder="输入网址后回车前往" />
					<button class="ztk-btn ztk-web-go" type="button" data-web-act="go">前往</button>
				</div>
				<div class="ztk-web-frame">
					<div class="ztk-web-frame-empty">
						<div class="ztk-web-frame-empty-inner">
							<p class="ztk-web-empty-title">选择左侧书签</p>
							<p class="ztk-muted">或点「＋」添加常用网页</p>
						</div>
					</div>
				</div>
			</section>
		`;
		this.shellReady = true;
		this.bind();
		this.syncCollapsed();
		this.renderBookmarks();
		this.showActive();
	}

	private renderBookmarks(): void {
		const box = this.host?.querySelector<HTMLElement>(".ztk-web-bookmarks");
		if (!box) return;
		const bookmarks = this.plugin.settings.webBookmarks;
		const prev = this.activeId;
		if (!this.activeId || !bookmarks.some((b) => b.id === this.activeId)) {
			this.activeId = bookmarks[0]?.id ?? "";
		}
		box.innerHTML = bookmarks.length
			? bookmarks.map((b) => {
				const host = hostOf(b.url);
				const mark = initialOf(b.title, b.url);
				return `
					<div class="ztk-web-bm ${b.id === this.activeId ? "sel" : ""}" data-web-id="${esc(b.id)}">
						<button type="button" class="ztk-web-bm-open" data-web-act="open" data-web-id="${esc(b.id)}" title="${esc(b.title || b.url)}">
							<span class="ztk-web-bm-mark" aria-hidden="true">${esc(mark)}</span>
							<span class="ztk-web-bm-meta">
								<span class="ztk-web-bm-title">${esc(b.title || b.url)}</span>
								<span class="ztk-web-bm-host">${esc(host || b.url)}</span>
							</span>
						</button>
						<button type="button" class="ztk-web-bm-del" data-web-act="del" data-web-id="${esc(b.id)}" title="删除" aria-label="删除">×</button>
					</div>`;
			}).join("")
			: `<div class="ztk-web-empty">
					<p class="ztk-web-empty-title">还没有书签</p>
					<p class="ztk-muted">把常用站点钉在这里，登录态会留在本插件分区。</p>
					<button type="button" class="ztk-btn" data-web-act="add">添加第一个</button>
				</div>`;
		this.syncToolbar();
		if (prev !== this.activeId) this.showActive();
	}

	private bind(): void {
		if (!this.host) return;
		this.host.onclick = (e) => {
			const t = (e.target as HTMLElement).closest<HTMLElement>("[data-web-act]");
			if (!t?.dataset.webAct) return;
			e.preventDefault();
			e.stopPropagation();
			const act = t.dataset.webAct;
			const id = t.dataset.webId ?? "";
			if (act === "add") this.openAddModal();
			if (act === "open" && id) this.openBookmark(id);
			if (act === "del" && id) void this.removeBookmark(id);
			if (act === "toggle-side") void this.toggleSide();
			if (act === "go") this.navigateFromInput();
			if (act === "reload") this.callWebview("reload");
			if (act === "back") this.callWebview("goBack");
		};
		const urlInput = this.host.querySelector<HTMLInputElement>(".ztk-web-url");
		urlInput?.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
				this.navigateFromInput();
			}
		});
	}

	private openBookmark(id: string): void {
		if (this.activeId === id) return;
		this.activeId = id;
		this.renderBookmarks();
		this.showActive();
	}

	private async toggleSide(): Promise<void> {
		this.plugin.settings.webSideCollapsed = !this.plugin.settings.webSideCollapsed;
		this.syncCollapsed();
		await this.plugin.saveSettings();
	}

	private syncCollapsed(): void {
		if (!this.host) return;
		const collapsed = this.plugin.settings.webSideCollapsed === true;
		this.host.classList.toggle("is-side-collapsed", collapsed);
		const btn = this.host.querySelector<HTMLButtonElement>(".ztk-web-collapse");
		if (!btn) return;
		btn.textContent = collapsed ? "›" : "‹";
		btn.title = collapsed ? "展开书签栏" : "折叠书签栏";
		btn.setAttribute("aria-label", btn.title);
	}

	private openAddModal(): void {
		new AddBookmarkModal(this.plugin, (bm) => {
			void this.commitBookmark(bm);
		}).open();
	}

	private async commitBookmark(bm: WebBookmark): Promise<void> {
		if (!Array.isArray(this.plugin.settings.webBookmarks)) {
			this.plugin.settings.webBookmarks = [];
		}
		this.plugin.settings.webBookmarks.push(bm);
		await this.plugin.saveSettings();
		this.activeId = bm.id;
		this.renderBookmarks();
		this.showActive();
		new Notice(`已添加书签：${bm.title}`);
	}

	private async removeBookmark(id: string): Promise<void> {
		const bm = this.plugin.settings.webBookmarks.find((b) => b.id === id);
		if (!bm) return;
		const ok = await new Promise<boolean>((resolve) => {
			const plugin = this.plugin;
			const modal = new class extends Modal {
				onOpen(): void {
					this.modalEl.addClass("ztk-bm-modal");
					this.contentEl.addClass("ztk-bm-modal-body");
					this.contentEl.createDiv({ cls: "ztk-bm-modal-eyebrow", text: "常见网页" });
					this.contentEl.createEl("h2", { text: "删除书签" });
					this.contentEl.createEl("p", {
						cls: "ztk-bm-modal-lead",
						text: `确定删除「${bm.title}」？此操作不可撤销。`,
					});
					const actions = this.contentEl.createDiv({ cls: "ztk-bm-modal-actions" });
					actions.createEl("button", { type: "button", cls: "ztk-ghost", text: "取消" })
						.addEventListener("click", () => {
							resolve(false);
							this.close();
						});
					actions.createEl("button", { type: "button", cls: "ztk-btn ztk-btn-danger", text: "删除" })
						.addEventListener("click", () => {
							resolve(true);
							this.close();
						});
				}
				onClose(): void {
					this.contentEl.empty();
				}
			}(plugin.app);
			modal.open();
		});
		if (!ok) return;
		this.plugin.settings.webBookmarks = this.plugin.settings.webBookmarks.filter((b) => b.id !== id);
		await this.plugin.saveSettings();
		this.views.get(id)?.remove();
		this.views.delete(id);
		if (this.activeId === id) this.activeId = this.plugin.settings.webBookmarks[0]?.id ?? "";
		this.renderBookmarks();
		this.showActive();
		new Notice("已删除书签");
	}

	private navigateFromInput(): void {
		const input = this.host?.querySelector<HTMLInputElement>(".ztk-web-url");
		const url = normalizeUrl(input?.value ?? "");
		if (!url || !this.activeId) return;
		const bm = this.plugin.settings.webBookmarks.find((b) => b.id === this.activeId);
		if (bm) {
			bm.url = url;
			void this.plugin.saveSettings();
		}
		const wv = this.views.get(this.activeId);
		if (!wv) {
			this.showActive();
			return;
		}
		try {
			if (wv.loadURL) wv.loadURL(url);
			else wv.src = url;
		} catch {
			wv.src = url;
		}
		this.renderBookmarks();
	}

	/** 只切换可见性：非当前书签的 webview 留在 DOM 里继续存活 */
	private showActive(): void {
		const frame = this.host?.querySelector<HTMLElement>(".ztk-web-frame");
		if (!frame) return;
		const bm = this.plugin.settings.webBookmarks.find((b) => b.id === this.activeId);
		const empty = frame.querySelector<HTMLElement>(".ztk-web-frame-empty");
		if (bm && !this.views.has(bm.id)) {
			const wv = this.createWebview(bm.url, frame);
			if (wv) this.views.set(bm.id, wv);
		}
		for (const [id, wv] of this.views) {
			wv.classList.toggle("on", !!bm && id === bm.id);
		}
		empty?.classList.toggle("is-hidden", !!bm);
		this.syncToolbar();
	}

	private createWebview(url: string, frame: HTMLElement): WebviewEl | null {
		if (!url) return null;
		try {
			const wv = document.createElement("webview") as WebviewEl;
			wv.setAttribute("partition", PARTITION);
			wv.setAttribute("allowpopups", "true");
			wv.setAttribute("webpreferences", "contextIsolation=yes");
			wv.className = "ztk-webview";
			wv.src = url;
			wv.addEventListener("did-navigate", () => this.syncUrlBar(wv));
			wv.addEventListener("did-navigate-in-page", () => this.syncUrlBar(wv));
			frame.appendChild(wv);
			return wv;
		} catch (err) {
			frame.createEl("div", {
				cls: "ztk-empty",
				text: `无法创建内嵌网页（当前 Electron 可能未启用 webview）：${String(err)}`,
			});
			return null;
		}
	}

	private currentUrl(id: string): string {
		const wv = this.views.get(id);
		if (!wv?.getURL) return "";
		try {
			return wv.getURL() ?? "";
		} catch {
			return "";
		}
	}

	private syncToolbar(): void {
		if (!this.host) return;
		const active = this.plugin.settings.webBookmarks.find((b) => b.id === this.activeId);
		this.host.querySelectorAll<HTMLButtonElement>(".ztk-web-tool, .ztk-web-go")
			.forEach((btn) => { btn.disabled = !active; });
		const input = this.host.querySelector<HTMLInputElement>(".ztk-web-url");
		if (!input) return;
		input.disabled = !active;
		if (document.activeElement === input) return;
		input.value = this.currentUrl(this.activeId) || active?.url || "";
	}

	private syncUrlBar(wv: WebviewEl): void {
		if (this.views.get(this.activeId) !== wv) return;
		const input = this.host?.querySelector<HTMLInputElement>(".ztk-web-url");
		const next = wv.getURL?.() ?? "";
		if (input && next && document.activeElement !== input) input.value = next;
	}

	private callWebview(method: "reload" | "goBack"): void {
		const wv = this.views.get(this.activeId);
		if (!wv) return;
		try {
			wv[method]?.();
		} catch {
			new Notice("当前网页不支持该操作");
		}
	}
}

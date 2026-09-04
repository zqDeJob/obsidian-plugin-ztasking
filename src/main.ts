import { Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { DEFAULT_SETTINGS, VIEW_TYPE, type WebBookmark, type ZTaskingSettings } from "./model";
import { TaskStore, isInTaskFolder } from "./store";
import { ZTaskingView } from "./view";

export default class ZTaskingPlugin extends Plugin {
	settings: ZTaskingSettings = DEFAULT_SETTINGS;
	store!: TaskStore;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new TaskStore(this.app, () => this.settings);

		this.registerView(VIEW_TYPE, (leaf) => new ZTaskingView(leaf, this));
		this.addRibbonIcon("calendar-check", "打开 Z-Tasking 任务台", () => {
			void this.activateView();
		});
		this.addCommand({
			id: "open-z-tasking",
			name: "打开任务台",
			callback: () => {
				void this.activateView();
			},
		});
		this.addSettingTab(new ZTaskingSettingTab(this.app, this));

		const refresh = this.debounce(() => {
			for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
				const view = leaf.view;
				if (view instanceof ZTaskingView) void view.refresh();
			}
		}, 250);

		this.registerEvent(this.app.vault.on("create", (f) => {
			if (f instanceof TFile && this.store.isTaskFile(f.path)) refresh();
		}));
		this.registerEvent(this.app.vault.on("modify", (f) => {
			if (f instanceof TFile && this.store.isTaskFile(f.path)) refresh();
		}));
		this.registerEvent(this.app.vault.on("delete", (f) => {
			if (isInTaskFolder(f, this.settings.rootFolder)) refresh();
		}));
		this.registerEvent(this.app.vault.on("rename", (f) => {
			if (isInTaskFolder(f, this.settings.rootFolder)) refresh();
		}));
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (existing) {
			workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as Partial<ZTaskingSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...raw,
			webBookmarks: Array.isArray(raw?.webBookmarks)
				? raw!.webBookmarks as WebBookmark[]
				: DEFAULT_SETTINGS.webBookmarks.map((b) => ({ ...b })),
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private debounce(fn: () => void, ms: number): () => void {
		let timer: number | null = null;
		return () => {
			if (timer) window.clearTimeout(timer);
			timer = window.setTimeout(fn, ms);
		};
	}
}

class ZTaskingSettingTab extends PluginSettingTab {
	plugin: ZTaskingPlugin;

	constructor(app: import("obsidian").App, plugin: ZTaskingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Z-Tasking" });
		new Setting(containerEl)
			.setName("任务根目录")
			.setDesc("任务笔记会写到 根目录/长期 与 根目录/临时。")
			.addText((text) => {
				text.setPlaceholder("z-tasking")
					.setValue(this.plugin.settings.rootFolder)
					.onChange(async (value) => {
						const next = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "z-tasking";
						this.plugin.settings.rootFolder = next;
						await this.plugin.saveSettings();
						await this.plugin.store.reload();
						new Notice(`任务目录：${next}/长期 、 ${next}/临时`);
					});
			});

		containerEl.createEl("h3", { text: "网页" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "书签可在「网页」页或下方添加/删除；登录态保存在插件专用 Chromium 分区（非系统 Chrome）。",
		});
		if (!Array.isArray(this.plugin.settings.webBookmarks)) {
			this.plugin.settings.webBookmarks = [];
		}
		for (const bm of this.plugin.settings.webBookmarks) {
			new Setting(containerEl)
				.setName(bm.title)
				.setDesc(bm.url)
				.addButton((btn) => {
					btn.setButtonText("删除").setWarning().onClick(async () => {
						this.plugin.settings.webBookmarks = this.plugin.settings.webBookmarks.filter((b) => b.id !== bm.id);
						await this.plugin.saveSettings();
						this.display();
					});
				});
		}
		let titleInput: HTMLInputElement | null = null;
		let urlInput: HTMLInputElement | null = null;
		new Setting(containerEl)
			.setName("添加书签")
			.setDesc("填写名称与网址后点添加")
			.addText((t) => {
				t.setPlaceholder("名称");
				titleInput = t.inputEl;
			})
			.addText((t) => {
				t.setPlaceholder("https://");
				urlInput = t.inputEl;
			})
			.addButton((btn) => {
				btn.setButtonText("添加").setCta().onClick(async () => {
					const title = titleInput?.value.trim() || "新网页";
					let url = urlInput?.value.trim() || "";
					if (!url) {
						new Notice("请填写网址");
						return;
					}
					if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
					if (!Array.isArray(this.plugin.settings.webBookmarks)) {
						this.plugin.settings.webBookmarks = [];
					}
					this.plugin.settings.webBookmarks.push({
						id: `bm-${Date.now().toString(36)}`,
						title,
						url,
					});
					await this.plugin.saveSettings();
					new Notice(`已添加书签：${title}`);
					this.display();
				});
			});
	}
}

import { Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { DEFAULT_SETTINGS, VIEW_TYPE, type ZTaskingSettings } from "./model";
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
	}
}

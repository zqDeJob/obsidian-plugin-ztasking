/** 帮助中心静态文案（与 GitHub 仓库 zqDeJob/obsidian-plugin-ztasking 对齐）。 */

export const HELP_BRAT_REPO = "zqDeJob/obsidian-plugin-ztasking";
export const HELP_BRAT_REPO_URL = "https://github.com/zqDeJob/obsidian-plugin-ztasking";

export type HelpNavGroup = {
	id: string;
	label: string;
	items: { id: string; title: string }[];
};

/** 侧栏锚点分组（与正文 section 一一对应）。 */
export function helpNavGroups(): HelpNavGroup[] {
	return [
		{
			id: "basics",
			label: "基础",
			items: [
				{ id: "help-project", title: "新增项目" },
				{ id: "help-task", title: "新增任务" },
				{ id: "help-view", title: "查看任务与进展" },
				{ id: "help-edit-task", title: "编辑任务与进展" },
				{ id: "help-edit-plan", title: "编辑昨日 / 明日计划" },
			],
		},
		{
			id: "report",
			label: "汇总",
			items: [
				{ id: "help-report-today", title: "我的今天" },
				{ id: "help-report-daily", title: "今日日报" },
				{ id: "help-report-logs", title: "进展明细" },
				{ id: "help-report-heat", title: "活跃分布" },
				{ id: "help-report-recent", title: "最近编辑" },
			],
		},
		{
			id: "work",
			label: "工作台",
			items: [
				{ id: "help-work-yp", title: "昨日计划" },
				{ id: "help-work-today", title: "我的今天" },
				{ id: "help-work-tp", title: "明日计划" },
				{ id: "help-work-catalog", title: "右侧任务表" },
				{ id: "help-work-detail", title: "任务详情抽屉" },
			],
		},
		{
			id: "sync",
			label: "同步",
			items: [{ id: "help-brat", title: "用 BRAT 安装与同步" }],
		},
	];
}

function helpCard(opts: { id: string; title: string; body: string }): string {
	return `<article class="ztk-help-card" id="${opts.id}">
		<h3>${opts.title}</h3>
		${opts.body}
	</article>`;
}

function helpGroup(opts: { id: string; label: string; cards: string }): string {
	return `<section class="ztk-help-group" id="help-group-${opts.id}">
		<header class="ztk-help-group-head">
			<h2>${opts.label}</h2>
		</header>
		<div class="ztk-help-group-body">
			${opts.cards}
		</div>
	</section>`;
}

function helpNavHtml(groups: HelpNavGroup[]): string {
	return `<nav class="ztk-help-nav" aria-label="帮助目录">
		<p class="ztk-help-nav-title">目录</p>
		${groups.map((g) => `
			<div class="ztk-help-nav-group">
				<a class="ztk-help-nav-group-link" href="#help-group-${g.id}" data-act="help-anchor" data-target="help-group-${g.id}">${g.label}</a>
				<ul>
					${g.items.map((it) => `
						<li><a href="#${it.id}" data-act="help-anchor" data-target="${it.id}">${it.title}</a></li>
					`).join("")}
				</ul>
			</div>
		`).join("")}
	</nav>`;
}

/** 帮助中心整页 HTML。 */
export function helpCenterHtml(): string {
	const groups = helpNavGroups();
	const basics = helpGroup({
		id: "basics",
		label: "基础",
		cards: [
			helpCard({
				id: "help-project",
				title: "新增项目",
				body: `<ol>
					<li>打开顶栏 <strong>工作台</strong> Tab（只有工作台会显示「项目管理」「新建任务」）。</li>
					<li>点右上角 <strong>项目管理</strong>，右侧打开项目管理抽屉。</li>
					<li>填写项目名并新增。目录为：<code>根目录/项目名/长期|临时|缺陷/</code>。</li>
					<li>可在列表里重命名；仍有任务的项目不能删除。</li>
				</ol>
				<p class="ztk-help-note">顶栏「全部项目 / 某项目」用于筛选任务与进展；新建任务前请先至少有一个项目。</p>`,
			}),
			helpCard({
				id: "help-task",
				title: "新增任务",
				body: `<ol>
					<li>在 <strong>工作台</strong> 点右上角 <strong>新建任务</strong>。</li>
					<li>填写标题、说明，选择<strong>业务项目</strong>与类型（长期 / 临时 / 缺陷），可设起止日期。</li>
					<li>确认后会在对应项目目录生成一篇 Markdown 笔记，并出现在右侧任务表。</li>
				</ol>
				<p>类型对应文件夹：<code>长期</code>、<code>临时</code>、<code>缺陷</code>。状态一般为未开始 / 进行中 / 已完结。</p>`,
			}),
			helpCard({
				id: "help-view",
				title: "查看任务与进展",
				body: `<ul>
					<li><strong>工作台</strong>右侧任务表：按类型/状态筛选、搜索、排序；点任务打开详情抽屉。</li>
					<li><strong>汇总</strong>：今日情况、日报草稿、周期进展明细与统计。</li>
					<li><strong>日历</strong>：按日看进展；可切到<strong>甘特图</strong>看任务跨度。</li>
					<li>顶栏<strong>周期</strong>（周 / 月 / 季 / 年或自定）影响汇总、日历、甘特的时间范围。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-edit-task",
				title: "编辑任务与进展",
				body: `<ul>
					<li>打开任务详情抽屉后，可改标题、说明、状态、类型、所属项目。</li>
					<li>在抽屉里为某日<strong>记一笔进展</strong>（可填工时），支持 Markdown。</li>
					<li>汇总页进展明细悬停行上的<strong>编辑</strong>图标，同样打开该任务抽屉并进入对应日期编辑。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-edit-plan",
				title: "编辑昨日 / 明日计划",
				body: `<ul>
					<li>工作台「昨日计划 / 明日计划」可新增、编辑、删除条目（抽屉编辑）。</li>
					<li>昨日计划来自「昨天日报」里的明日计划段，可批量新增或重置回日报原文。</li>
					<li>明日计划与汇总「今日日报」中的明日计划同步。</li>
				</ul>`,
			}),
		].join("\n"),
	});

	const report = helpGroup({
		id: "report",
		label: "汇总",
		cards: [
			helpCard({
				id: "help-report-today",
				title: "我的今天",
				body: `<p>列出<strong>今天</strong>已记过进展的任务与工时合计。始终看<strong>全部项目</strong>（不受顶栏项目筛选影响）。</p>
				<ul>
					<li>可开「按项目」开关做分组展示（只分组，不筛掉其他项目）。</li>
					<li>点任务可进入详情。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-report-daily",
				title: "今日日报",
				body: `<p>可编辑的日报草稿，始终按全部项目汇总今日工作线索。</p>
				<ul>
					<li><strong>今日工作</strong>：默认可按「我的今天」自动填充，可改。</li>
					<li><strong>明日计划 / 待讨论</strong>：自行维护。</li>
					<li>支持重置今日工作、重置明日计划、一键复制全文。</li>
					<li>换日时会归档到 <code>根目录/日报/日期.md</code>。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-report-logs",
				title: "进展明细",
				body: `<p>当前周期内的进展列表；受顶栏<strong>项目筛选</strong>与<strong>周期</strong>影响。</p>
				<ul>
					<li><strong>按时间</strong>：逐条按日期展示。</li>
					<li><strong>按项目</strong>：按项目再按任务合并。</li>
					<li>支持搜索高亮（不筛选）、复制明细。</li>
					<li>悬停行上可点编辑，打开任务抽屉改该日进展。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-report-heat",
				title: "活跃分布",
				body: `<p>周期内每日记了几笔进展的热力小格，用来扫活跃密度。受顶栏项目筛选与周期影响。</p>`,
			}),
			helpCard({
				id: "help-report-recent",
				title: "最近编辑",
				body: `<p>按最近更新时间列出任务，点开可跳到对应任务。放在活跃分布下方。</p>`,
			}),
		].join("\n"),
	});

	const work = helpGroup({
		id: "work",
		label: "工作台",
		cards: [
			helpCard({
				id: "help-work-yp",
				title: "昨日计划",
				body: `<p>对照「昨天该做、今天要兑现」的计划列表（读取昨天日报里的明日计划）。</p>
				<ul>
					<li>可新增、批量新增、编辑、删除、重置。</li>
					<li>区块可折叠，不占视线。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-work-today",
				title: "我的今天",
				body: `<p>与汇总页同款：今天已写进展的任务一览，方便对照计划与实际。</p>
				<ul>
					<li>同样支持「按项目」分组开关。</li>
					<li>始终看全部项目。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-work-tp",
				title: "明日计划",
				body: `<p>写进今日日报草稿的「明天要做」清单。</p>
				<ul>
					<li>在工作台以列表编辑（抽屉改条目）。</li>
					<li>与汇总「今日日报」里的明日计划同步。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-work-catalog",
				title: "右侧任务表",
				body: `<p>当前顶栏项目筛选下的任务目录。</p>
				<ul>
					<li>类型 Chip、状态筛选、日期范围、搜索。</li>
					<li>列排序或拖拽手动排序。</li>
					<li>点任务 → 打开详情抽屉。</li>
				</ul>`,
			}),
			helpCard({
				id: "help-work-detail",
				title: "任务详情抽屉",
				body: `<p>记事与改任务的主入口。</p>
				<ul>
					<li>改标题 / 说明 / 状态 / 类型 / 所属项目。</li>
					<li>按日进展列表：新增今日进展、编辑历史进展、填写工时。</li>
				</ul>`,
			}),
		].join("\n"),
	});

	const sync = helpGroup({
		id: "sync",
		label: "同步",
		cards: helpCard({
			id: "help-brat",
			title: "用 BRAT 安装与同步",
			body: `<p><strong>BRAT</strong>（Beta Reviewer's Auto-update Tool）可从 GitHub Release 安装并更新本插件。</p>
			<p>仓库：<code>${HELP_BRAT_REPO}</code> · <a class="external-link" href="${HELP_BRAT_REPO_URL}" target="_blank" rel="noopener">打开 GitHub</a></p>
			<h4 class="ztk-help-h3">安装 BRAT</h4>
			<ol>
				<li>设置 → 第三方插件 → 关闭安全模式 → 浏览，搜索 <code>BRAT</code>，安装并启用。</li>
			</ol>
			<h4 class="ztk-help-h3">添加 Z-Tasking</h4>
			<ol>
				<li>命令面板运行：<code>BRAT: Plugins: Add a beta plugin for testing</code>（选「添加 beta 插件」即可）。</li>
				<li>仓库地址填：</li>
			</ol>
			<pre class="ztk-help-code">${HELP_BRAT_REPO}</pre>
			<ol start="3">
				<li>BRAT 会下载最新 Release 的 <code>main.js</code>、<code>manifest.json</code>、<code>styles.css</code>。</li>
				<li>设置 → 第三方插件 → 启用 <strong>Z-Tasking</strong>；命令面板运行 <code>Z-Tasking: 打开任务台</code>。</li>
			</ol>
			<h4 class="ztk-help-h3">同步到最新版</h4>
			<ol>
				<li><strong>手动</strong>：命令面板 <code>BRAT: Check for updates to all beta plugins</code>。</li>
				<li><strong>自动</strong>：在 BRAT 设置里打开自动检查 / 更新。</li>
				<li>更新后<strong>重载 Obsidian</strong>，确保加载新包。</li>
			</ol>
			<p class="ztk-help-note">BRAT 跟的是 GitHub <strong>Release 附件</strong>，不是任意 commit；只有正式发版才会被同步到。</p>
			<h4 class="ztk-help-h3">常见问题</h4>
			<dl class="ztk-help-faq">
				<dt>提示找不到插件 / 下载失败？</dt>
				<dd>确认仓库公开可读，且最新 Release 已上传 <code>main.js</code>、<code>manifest.json</code>、<code>styles.css</code>。</dd>
				<dt>更新了但界面没变？</dt>
				<dd>确认 BRAT 已升到目标版本后完全重载；再到 <code>.obsidian/plugins/z-tasking/</code> 看 <code>manifest.json</code> 的 version。</dd>
				<dt>想固定某一版？</dt>
				<dd>在 BRAT 对该仓库关闭自动更新，或使用其「冻结版本」选项（以你安装的 BRAT 文案为准）。</dd>
				<dt>和社区插件市场会冲突吗？</dt>
				<dd>插件 id 为 <code>z-tasking</code>。若也上架社区目录，请只保留一种安装来源，避免两套目录互相覆盖。</dd>
			</dl>`,
		}),
	});

	return `<div class="ztk-help">
		<header class="ztk-help-hero">
			<p class="ztk-help-eyebrow">Z-Tasking</p>
			<h1>帮助中心</h1>
			<p class="ztk-help-lead">左侧点目录跳转；同类说明归在一组，便于对照界面模块。</p>
		</header>
		<div class="ztk-help-layout">
			${helpNavHtml(groups)}
			<div class="ztk-help-main">
				${basics}
				${report}
				${work}
				${sync}
			</div>
		</div>
	</div>`;
}

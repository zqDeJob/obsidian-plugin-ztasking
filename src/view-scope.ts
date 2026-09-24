/** 与 view.ts 的 BoardView 对齐；抽离便于单测「只 paint 当前页」。 */
export type ScopeView = "board" | "detail" | "cal" | "gantt" | "report" | "web";

export type ScopeTopTab = "report" | "work" | "schedule" | "web";

export function pageIdForScopeView(view: ScopeView): Exclude<ScopeView, "detail"> {
	if (view === "detail") return "board";
	return view;
}

export function topTabForScopeView(view: ScopeView): ScopeTopTab {
	if (view === "report") return "report";
	if (view === "cal" || view === "gantt") return "schedule";
	if (view === "web") return "web";
	return "work";
}

/** 顶栏 Tab 是否发生切换（日历↔甘特同属 schedule，不算顶栏切换）。 */
export function isTopTabChange(fromView: ScopeView, toTab: ScopeTopTab): boolean {
	return topTabForScopeView(fromView) !== toTab;
}

/**
 * Markdown 渲染根选择器：当前页 +（抽屉打开时）详情抽屉。
 * 避免隐藏页里的 .ztk-md 被全量 paint。
 */
export function markdownPaintRootSelectors(view: ScopeView, detailOpen: boolean): string[] {
	const roots = [`#ztk-view-${pageIdForScopeView(view)}`];
	if (detailOpen) roots.push(".ztk-detail-drawer .ztk-detail");
	return roots;
}

export type ShellRenderTarget = "board" | "cal" | "gantt" | "report" | "web";

/** 当前 view 需要刷新的壳层目标（不含抽屉；抽屉由 detailOpen 单独决定）。 */
export function shellRenderTargets(view: ScopeView): ShellRenderTarget[] {
	const page = pageIdForScopeView(view);
	if (page === "board") return ["board"];
	if (page === "cal") return ["cal"];
	if (page === "gantt") return ["gantt"];
	if (page === "report") return ["report"];
	return ["web"];
}

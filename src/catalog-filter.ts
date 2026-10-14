import {
	STATUS_LABEL,
	TYPE_LABEL,
	YP_NO_PROJECT,
	esc,
	type Task,
	type TaskStatus,
	type TaskType,
} from "./model.ts";
import { taskPeriodOverlaps } from "./catalog.ts";

export type CatalogAdvOp = "include" | "exclude";
export type CatalogAdvColumn =
	| "title"
	| "project"
	| "branch"
	| "type"
	| "status"
	| "period"
	| "count"
	| "hours";
/** @deprecated 使用 CatalogAdvMode */
export type CatalogAdvMatchMode = CatalogAdvMode;
export type CatalogAdvMode = "all" | "any";

export type CatalogAdvRule = {
	kind: "rule";
	id: string;
	op: CatalogAdvOp;
	column: CatalogAdvColumn;
	value: string;
};

export type CatalogAdvGroup = {
	kind: "group";
	id: string;
	mode: CatalogAdvMode;
	children: CatalogAdvNode[];
};

export type CatalogAdvNode = CatalogAdvRule | CatalogAdvGroup;

/** 根下可再套一层组（depth 0 → 1）；子组不可再套组 */
export const CATALOG_ADV_MAX_GROUP_DEPTH = 1;

export const CATALOG_ADV_COLUMNS: { key: CatalogAdvColumn; label: string }[] = [
	{ key: "title", label: "标题" },
	{ key: "project", label: "项目" },
	{ key: "branch", label: "分支" },
	{ key: "type", label: "类型" },
	{ key: "status", label: "状态" },
	{ key: "period", label: "周期" },
	{ key: "count", label: "进展" },
	{ key: "hours", label: "工时" },
];

export function newCatalogAdvId(prefix = "adv"): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** @deprecated 使用 newCatalogAdvId */
export function newCatalogAdvRuleId(): string {
	return newCatalogAdvId("adv");
}

export function emptyCatalogAdvRule(partial?: Partial<Omit<CatalogAdvRule, "kind">> & { kind?: "rule" }): CatalogAdvRule {
	return {
		kind: "rule",
		id: partial?.id ?? newCatalogAdvId("adv"),
		op: partial?.op ?? "include",
		column: partial?.column ?? "status",
		value: partial?.value ?? "",
	};
}

export function emptyCatalogAdvGroup(
	partial?: Partial<Omit<CatalogAdvGroup, "kind">> & { kind?: "group" },
): CatalogAdvGroup {
	return {
		kind: "group",
		id: partial?.id ?? newCatalogAdvId("grp"),
		mode: partial?.mode ?? "all",
		children: partial?.children ? [...partial.children] : [],
	};
}

export function hasEffectiveAdv(node: CatalogAdvNode): boolean {
	if (node.kind === "rule") return node.value.trim() !== "";
	return node.children.some(hasEffectiveAdv);
}

export function countEffectiveAdvRules(root: CatalogAdvGroup): number {
	let n = 0;
	const walk = (node: CatalogAdvNode) => {
		if (node.kind === "rule") {
			if (node.value.trim() !== "") n += 1;
			return;
		}
		for (const c of node.children) walk(c);
	};
	walk(root);
	return n;
}

function taskHours(task: Task): number {
	return task.logs.reduce((sum, l) => sum + (l.hours ?? 0), 0);
}

function matchPositive(task: Task, column: CatalogAdvColumn, raw: string): boolean {
	const value = raw.trim();
	if (!value) return true;
	switch (column) {
		case "title":
			return task.title.toLowerCase().includes(value.toLowerCase());
		case "project": {
			const p = (task.project ?? "").trim() || YP_NO_PROJECT;
			return p === value;
		}
		case "branch":
			return (task.branch ?? "").trim() === value;
		case "type":
			return task.type === value;
		case "status":
			return task.status === value;
		case "period":
			return taskPeriodOverlaps(task, value, value);
		case "count": {
			const n = Number(value);
			if (!Number.isFinite(n)) return false;
			return task.logs.length === n;
		}
		case "hours": {
			const n = Number(value);
			if (!Number.isFinite(n)) return false;
			return Math.abs(taskHours(task) - n) < 1e-9;
		}
		default:
			return true;
	}
}

export function matchCatalogAdvRule(task: Task, rule: CatalogAdvRule): boolean {
	const hit = matchPositive(task, rule.column, rule.value);
	return rule.op === "include" ? hit : !hit;
}

export function matchCatalogAdvNode(task: Task, node: CatalogAdvNode): boolean {
	if (node.kind === "rule") return matchCatalogAdvRule(task, node);
	const effective = node.children.filter(hasEffectiveAdv);
	if (!effective.length) return true;
	if (node.mode === "any") return effective.some((c) => matchCatalogAdvNode(task, c));
	return effective.every((c) => matchCatalogAdvNode(task, c));
}

export function matchCatalogAdvRoot(task: Task, root: CatalogAdvGroup): boolean {
	return matchCatalogAdvNode(task, root);
}

/** 打开面板时若根组无子节点，塞入一条空规则 */
export function advEnsureSeed(root: CatalogAdvGroup): CatalogAdvGroup {
	if (root.children.length) return root;
	return { ...root, children: [emptyCatalogAdvRule()] };
}

function mapGroup(
	root: CatalogAdvGroup,
	groupId: string,
	fn: (g: CatalogAdvGroup) => CatalogAdvGroup,
): CatalogAdvGroup {
	const walk = (node: CatalogAdvNode): CatalogAdvNode => {
		if (node.kind === "rule") return node;
		const nextChildren = node.children.map(walk);
		const self = node.id === groupId ? fn({ ...node, children: nextChildren }) : { ...node, children: nextChildren };
		return self;
	};
	const out = walk(root);
	return out.kind === "group" ? out : root;
}

function findGroupDepth(root: CatalogAdvGroup, groupId: string): number | null {
	const walk = (g: CatalogAdvGroup, depth: number): number | null => {
		if (g.id === groupId) return depth;
		for (const c of g.children) {
			if (c.kind === "group") {
				const d = walk(c, depth + 1);
				if (d !== null) return d;
			}
		}
		return null;
	};
	return walk(root, 0);
}

export function advAddRule(root: CatalogAdvGroup, parentId: string): CatalogAdvGroup {
	return mapGroup(root, parentId, (g) => ({
		...g,
		children: [...g.children, emptyCatalogAdvRule()],
	}));
}

export function advAddGroup(root: CatalogAdvGroup, parentId: string): CatalogAdvGroup {
	const depth = findGroupDepth(root, parentId);
	if (depth === null || depth >= CATALOG_ADV_MAX_GROUP_DEPTH) return root;
	return mapGroup(root, parentId, (g) => ({
		...g,
		children: [
			...g.children,
			emptyCatalogAdvGroup({ children: [emptyCatalogAdvRule()] }),
		],
	}));
}

export function advRemoveNode(root: CatalogAdvGroup, nodeId: string): CatalogAdvGroup {
	if (root.id === nodeId) return emptyCatalogAdvGroup({ id: root.id, mode: root.mode });
	const prune = (g: CatalogAdvGroup): CatalogAdvGroup => {
		const children = g.children
			.filter((c) => c.id !== nodeId)
			.map((c) => (c.kind === "group" ? prune(c) : c));
		return { ...g, children };
	};
	return prune(root);
}

export function advToggleGroupMode(root: CatalogAdvGroup, groupId: string): CatalogAdvGroup {
	return mapGroup(root, groupId, (g) => ({
		...g,
		mode: g.mode === "all" ? "any" : "all",
	}));
}

export function advUpdateRule(
	root: CatalogAdvGroup,
	ruleId: string,
	field: string,
	value: string,
): CatalogAdvGroup {
	const walk = (node: CatalogAdvNode): CatalogAdvNode => {
		if (node.kind === "group") {
			return { ...node, children: node.children.map(walk) };
		}
		if (node.id !== ruleId) return node;
		if (field === "op" && (value === "include" || value === "exclude")) {
			return { ...node, op: value };
		}
		if (field === "column") {
			const col = value as CatalogAdvColumn;
			if (!CATALOG_ADV_COLUMNS.some((c) => c.key === col)) return node;
			return { ...node, column: col, value: "" };
		}
		if (field === "value") return { ...node, value };
		return node;
	};
	const out = walk(root);
	return out.kind === "group" ? out : root;
}

export function advClear(root: CatalogAdvGroup): CatalogAdvGroup {
	return { ...root, children: [] };
}

function valueControlHtml(rule: CatalogAdvRule, projects: string[], branches: string[] = []): string {
	const id = esc(rule.id);
	const v = esc(rule.value);
	switch (rule.column) {
		case "title":
			return `<input type="text" class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" placeholder="包含文字" value="${v}" />`;
		case "project": {
			const opts = [YP_NO_PROJECT, ...projects.filter((p) => p && p !== YP_NO_PROJECT)];
			return `<select class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" aria-label="项目取值">
				<option value="">选择项目</option>
				${opts.map((p) => `<option value="${esc(p)}"${p === rule.value ? " selected" : ""}>${esc(p)}</option>`).join("")}
			</select>`;
		}
		case "branch": {
			const opts = branches.length ? branches : [];
			return `<select class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" aria-label="分支取值">
				<option value="">选择分支</option>
				${opts.map((b) => `<option value="${esc(b)}"${b === rule.value ? " selected" : ""}>${esc(b)}</option>`).join("")}
			</select>`;
		}
		case "type":
			return `<select class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" aria-label="类型取值">
				<option value="">选择类型</option>
				${(Object.keys(TYPE_LABEL) as TaskType[]).map((k) =>
					`<option value="${k}"${k === rule.value ? " selected" : ""}>${TYPE_LABEL[k]}</option>`).join("")}
			</select>`;
		case "status":
			return `<select class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" aria-label="状态取值">
				<option value="">选择状态</option>
				${(Object.keys(STATUS_LABEL) as TaskStatus[]).map((k) =>
					`<option value="${k}"${k === rule.value ? " selected" : ""}>${STATUS_LABEL[k]}</option>`).join("")}
			</select>`;
		case "period":
			return `<input type="date" class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" value="${v}" aria-label="周期日期" />`;
		case "count":
			return `<input type="number" min="0" step="1" class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" placeholder="笔数" value="${v}" />`;
		case "hours":
			return `<input type="number" min="0" step="0.1" class="ztk-adv-value" data-adv-id="${id}" data-adv-field="value" placeholder="小时" value="${v}" />`;
		default:
			return "";
	}
}

function connectorLabel(mode: CatalogAdvMode, index: number): string {
	if (index === 0) return "当";
	return mode === "all" ? "且" : "或";
}

function ruleRowHtml(
	rule: CatalogAdvRule,
	projects: string[],
	branches: string[],
	mode: CatalogAdvMode,
	index: number,
	groupId: string,
): string {
	const id = esc(rule.id);
	const conn = connectorLabel(mode, index);
	const connBtn = index === 0
		? `<span class="ztk-adv-conn is-when">${conn}</span>`
		: `<button type="button" class="ztk-adv-conn is-toggle" data-act="adv-toggle-mode" data-adv-group="${esc(groupId)}" title="切换且/或">${conn}</button>`;
	return `<div class="ztk-adv-rule" data-adv-id="${id}">
		<button type="button" class="ztk-ghost ztk-adv-del" data-act="adv-del-node" data-adv-id="${id}" title="删除条件">−</button>
		${connBtn}
		<select class="ztk-adv-column" data-adv-id="${id}" data-adv-field="column" aria-label="筛选列">
			${CATALOG_ADV_COLUMNS.map((c) =>
				`<option value="${c.key}"${c.key === rule.column ? " selected" : ""}>${c.label}</option>`).join("")}
		</select>
		<select class="ztk-adv-op" data-adv-id="${id}" data-adv-field="op" aria-label="筛选动作">
			<option value="include"${rule.op === "include" ? " selected" : ""}>包含</option>
			<option value="exclude"${rule.op === "exclude" ? " selected" : ""}>不包含</option>
		</select>
		${valueControlHtml(rule, projects, branches)}
	</div>`;
}

function groupBlockHtml(
	group: CatalogAdvGroup,
	projects: string[],
	branches: string[],
	depth: number,
	outer?: { mode: CatalogAdvMode; index: number; parentId: string },
): string {
	const gid = esc(group.id);
	const body = group.children.map((child, i) => {
		if (child.kind === "rule") return ruleRowHtml(child, projects, branches, group.mode, i, group.id);
		return groupAsChildHtml(child, projects, branches, depth + 1, group.mode, i, group.id);
	}).join("");
	const canAddGroup = depth < CATALOG_ADV_MAX_GROUP_DEPTH;
	const actions = `<div class="ztk-adv-actions">
		<button type="button" class="ztk-adv-link" data-act="adv-add-rule" data-adv-group="${gid}">+ 添加条件</button>
		${canAddGroup ? `<button type="button" class="ztk-adv-link" data-act="adv-add-group" data-adv-group="${gid}">+ 添加条件组</button>` : ""}
	</div>`;
	const inner = `<div class="ztk-adv-group-body" data-adv-group="${gid}">
		${body || `<div class="ztk-adv-empty">暂无条件</div>`}
		${actions}
	</div>`;
	if (!outer) return inner;
	const conn = connectorLabel(outer.mode, outer.index);
	const connBtn = outer.index === 0
		? `<span class="ztk-adv-conn is-when">${conn}</span>`
		: `<button type="button" class="ztk-adv-conn is-toggle" data-act="adv-toggle-mode" data-adv-group="${esc(outer.parentId)}" title="切换且/或">${conn}</button>`;
	return `<div class="ztk-adv-group-row" data-adv-id="${gid}">
		<button type="button" class="ztk-ghost ztk-adv-del" data-act="adv-del-node" data-adv-id="${gid}" title="删除条件组">−</button>
		${connBtn}
		<div class="ztk-adv-group-card">
			${inner}
		</div>
	</div>`;
}

function groupAsChildHtml(
	group: CatalogAdvGroup,
	projects: string[],
	branches: string[],
	depth: number,
	parentMode: CatalogAdvMode,
	index: number,
	parentId: string,
): string {
	return groupBlockHtml(group, projects, branches, depth, { mode: parentMode, index, parentId });
}

export function catalogAdvPanelHtml(opts: {
	open: boolean;
	root: CatalogAdvGroup;
	projects: string[];
	branches?: string[];
}): string {
	if (!opts.open) return "";
	const root = advEnsureSeed(opts.root);
	const branches = opts.branches ?? [];
	return `<div class="ztk-adv-panel" role="region" aria-label="筛选条件">
		${groupBlockHtml(root, opts.projects, branches, 0)}
	</div>`;
}

export function catalogAdvToggleInnerHtml(opts: {
	open: boolean;
	activeCount: number;
}): string {
	const badge = opts.activeCount > 0
		? `<span class="ztk-adv-badge" aria-label="${opts.activeCount} 个有效条件">${opts.activeCount}</span>`
		: "";
	const chevron = opts.open ? "▴" : "▾";
	return `<span class="ztk-adv-toggle-label">筛选</span>${badge}<span class="ztk-adv-chevron" aria-hidden="true">${chevron}</span>`;
}

import { DAILY_REPORT_DIR } from "./daily-archive.ts";
import { TYPE_DIR, type TaskType } from "./model.ts";

/** 现有扁平任务迁入的默认业务项目 */
export const DEFAULT_PROJECT = "KVAD";

const TYPE_DIR_NAMES = new Set<string>(Object.values(TYPE_DIR));

function normalizeRoot(root: string): string {
	return root.replace(/\/+$/, "");
}

export function isTypeDirName(name: string): boolean {
	return TYPE_DIR_NAMES.has(name);
}

export function isReservedRootName(name: string): boolean {
	return name === DAILY_REPORT_DIR || isTypeDirName(name);
}

export function isLegacyRootTypeFolder(name: string): boolean {
	return isTypeDirName(name);
}

export function taskDir(root: string, project: string, type: TaskType): string {
	return `${normalizeRoot(root)}/${project}/${TYPE_DIR[type]}`;
}

/** 是否为新结构任务笔记：根/项目/类型/*.md */
export function isTaskPath(root: string, path: string): boolean {
	const r = normalizeRoot(root);
	if (!path.startsWith(`${r}/`) || !path.toLowerCase().endsWith(".md")) return false;
	const segs = path.slice(r.length + 1).split("/");
	if (segs.length < 3) return false;
	const [project, typeName] = segs;
	if (!project || !typeName) return false;
	if (isReservedRootName(project)) return false;
	return isTypeDirName(typeName);
}

/** 旧扁平：根/类型/*.md（迁移前） */
export function isLegacyTaskPath(root: string, path: string): boolean {
	const r = normalizeRoot(root);
	if (!path.startsWith(`${r}/`) || !path.toLowerCase().endsWith(".md")) return false;
	const segs = path.slice(r.length + 1).split("/");
	if (segs.length < 2) return false;
	return isTypeDirName(segs[0] ?? "");
}

export function parseProjectFromPath(root: string, path: string): string | null {
	const r = normalizeRoot(root);
	if (!path.startsWith(`${r}/`)) return null;
	const segs = path.slice(r.length + 1).split("/");
	if (segs.length >= 3 && isTypeDirName(segs[1] ?? "") && !isReservedRootName(segs[0] ?? "")) {
		return segs[0] ?? null;
	}
	return null;
}

/** 新路径取项目；旧扁平路径回落默认项目 */
export function projectFromPath(root: string, path: string): string {
	return parseProjectFromPath(root, path) ?? DEFAULT_PROJECT;
}

export function needsLegacyMigration(rootChildren: string[]): boolean {
	return rootChildren.some((name) => isLegacyRootTypeFolder(name));
}

/** 根下项目文件夹名；排除日报与旧类型目录；按中文名排序；空库才回落默认 */
export function listProjectNames(rootChildren: string[]): string[] {
	const seen = new Set<string>();
	const names: string[] = [];
	for (const raw of rootChildren) {
		const name = typeof raw === "string" ? raw.trim() : "";
		if (!name || isReservedRootName(name)) continue;
		if (seen.has(name)) continue;
		seen.add(name);
		names.push(name);
	}
	if (names.length === 0) return [DEFAULT_PROJECT];
	names.sort((a, b) => a.localeCompare(b, "zh"));
	return names;
}

/**
 * 从 vault.adapter.list 返回的文件夹路径中，取出「根目录下一级」子文件夹名。
 * 用于空项目夹在 Obsidian 索引里丢失时，仍能从磁盘发现。
 */
export function rootFolderNamesFromListing(root: string, folderPaths: string[]): string[] {
	const r = normalizeRoot(root);
	const prefix = `${r}/`;
	const names: string[] = [];
	const seen = new Set<string>();
	for (const raw of folderPaths) {
		const path = raw.replace(/\\/g, "/").replace(/\/+$/, "");
		if (!path.startsWith(prefix)) continue;
		const rest = path.slice(prefix.length);
		if (!rest || rest.includes("/")) continue;
		if (seen.has(rest)) continue;
		seen.add(rest);
		names.push(rest);
	}
	return names;
}

export function filterByProject<T extends { project: string }>(
	items: T[],
	projectFilter: string,
): T[] {
	const q = projectFilter.trim();
	if (!q || q === "all") return items;
	return items.filter((it) => it.project === q);
}

/** 新建任务默认项目：顶栏筛了具体项目用筛选值，否则取列表首项；无项目则空串由表单必填兜底 */
export function resolveNewTaskProject(projectFilter: string, projects: string[] = []): string {
	const q = projectFilter.trim();
	if (q && q !== "all") return q;
	return projects[0]?.trim() || "";
}

/** select 选中值：preferred 在列表中则用它，否则列表首项 */
export function resolveProjectSelectValue(preferred: string, projects: string[]): string {
	const q = preferred.trim();
	if (q && projects.includes(q)) return q;
	return projects[0]?.trim() || "";
}

/**
 * 规范化新建项目名；空、保留名（日报/类型目录）、含路径分隔符则返回 null。
 */
export function normalizeProjectName(raw: string): string | null {
	const name = raw.trim().replace(/[\\/]/g, "").replace(/\s+/g, " ");
	if (!name) return null;
	if (isReservedRootName(name)) return null;
	return name;
}

export function canDeleteProject(
	project: string,
	tasks: { project: string }[],
): { ok: true } | { ok: false; reason: string } {
	const name = project.trim();
	if (!name || isReservedRootName(name)) {
		return { ok: false, reason: "项目名无效（不能是「日报 / 长期 / 临时 / 缺陷」）" };
	}
	const n = tasks.filter((t) => t.project === name).length;
	if (n > 0) {
		return {
			ok: false,
			reason: `「${name}」下还有 ${n} 个任务，请先迁移或删除任务后再删项目`,
		};
	}
	return { ok: true };
}

export function prepareRenameProject(
	from: string,
	rawTo: string,
	projects: string[],
): { ok: true; from: string; to: string } | { ok: false; reason: string } {
	const oldName = from.trim();
	if (!oldName || isReservedRootName(oldName)) {
		return { ok: false, reason: "原项目名无效" };
	}
	const to = normalizeProjectName(rawTo);
	if (!to) {
		return { ok: false, reason: "项目名无效（不能为空，也不能是「日报 / 长期 / 临时 / 缺陷」）" };
	}
	if (to === oldName) {
		return { ok: false, reason: "名称未变化" };
	}
	if (projects.includes(to)) {
		return { ok: false, reason: `已存在项目「${to}」` };
	}
	return { ok: true, from: oldName, to };
}

/** 项目改名后，把任务 path / sidebarOrder id 里旧前缀换成新前缀 */
export function remapPathsAfterProjectRename(
	paths: string[],
	root: string,
	from: string,
	to: string,
): string[] {
	const r = normalizeRoot(root);
	const prefix = `${r}/${from}/`;
	const nextPrefix = `${r}/${to}/`;
	return paths.map((p) => (p.startsWith(prefix) ? `${nextPrefix}${p.slice(prefix.length)}` : p));
}

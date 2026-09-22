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

/** 根下项目文件夹名；排除日报与旧类型目录；默认项目始终首位 */
export function listProjectNames(rootChildren: string[]): string[] {
	const others = rootChildren
		.filter((name) => name && !isReservedRootName(name) && name !== DEFAULT_PROJECT)
		.sort((a, b) => a.localeCompare(b, "zh"));
	return [DEFAULT_PROJECT, ...others];
}

export function filterByProject<T extends { project: string }>(
	items: T[],
	projectFilter: string,
): T[] {
	const q = projectFilter.trim();
	if (!q || q === "all") return items;
	return items.filter((it) => it.project === q);
}

export function resolveNewTaskProject(projectFilter: string): string {
	const q = projectFilter.trim();
	if (!q || q === "all") return DEFAULT_PROJECT;
	return q;
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

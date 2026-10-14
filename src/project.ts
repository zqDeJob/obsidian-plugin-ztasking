import { DAILY_REPORT_DIR } from "./daily-archive.ts";
import { TYPE_DIR, type TaskType } from "./model.ts";

/** 现有扁平任务迁入的默认业务项目 */
export const DEFAULT_PROJECT = "KVAD";
/** 无分支段时的默认 Git/发布分支 */
export const DEFAULT_BRANCH = "main";

/** 项目知识库目录名（位于 {root}/{project}/ 下） */
export const PROJECT_MATERIALS_DIR = "_资料";
/** 项目公告固定文件名 */
export const PROJECT_NOTICE_FILE = "公告.md";
/** 分支公告历史目录（位于 根/项目/分支/ 下） */
export const NOTICE_HISTORY_DIR = "_公告历史";

/** 项目名中拆分支的分隔符（迁移用） */
export const PROJECT_BRANCH_SPLIT = " - ";

const TYPE_DIR_NAMES = new Set<string>(Object.values(TYPE_DIR));

function normalizeRoot(root: string): string {
	return root.replace(/\/+$/, "");
}

export function materialsDir(root: string, project: string): string {
	return `${normalizeRoot(root)}/${project.trim()}/${PROJECT_MATERIALS_DIR}`;
}

/** 分支公告：根/项目/分支/公告.md（各分支独立） */
export function noticePath(root: string, project: string, branch: string = DEFAULT_BRANCH): string {
	const b = branch.trim() || DEFAULT_BRANCH;
	return `${normalizeRoot(root)}/${project.trim()}/${b}/${PROJECT_NOTICE_FILE}`;
}

/** 旧版项目级公告（_资料/公告.md），迁移用 */
export function legacyNoticePath(root: string, project: string): string {
	return `${materialsDir(root, project)}/${PROJECT_NOTICE_FILE}`;
}

/** 分支公告历史目录 */
export function noticeHistoryDir(root: string, project: string, branch: string): string {
	const b = branch.trim() || DEFAULT_BRANCH;
	return `${normalizeRoot(root)}/${project.trim()}/${b}/${NOTICE_HISTORY_DIR}`;
}

/** 生成历史文件名时间戳：2026-10-14_161205 */
export function formatNoticeHistoryStamp(d: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function noticeHistoryFilePath(
	root: string,
	project: string,
	branch: string,
	stamp: string,
): string {
	const safe = stamp.trim().replace(/[\\/]/g, "") || formatNoticeHistoryStamp();
	return `${noticeHistoryDir(root, project, branch)}/${safe}.md`;
}

/** 材料笔记路径；title 去掉路径分隔与首尾空白 */
export function materialNotePath(root: string, project: string, title: string): string {
	const safe = title.trim().replace(/[\\/]/g, "").replace(/\s+/g, " ") || "未命名";
	const base = safe.toLowerCase().endsWith(".md") ? safe.slice(0, -3) : safe;
	return `${materialsDir(root, project)}/${base}.md`;
}

/**
 * 合并拖拽序与磁盘项目名：
 * saved 中仍存在的保持相对序；disk 有而 saved 无的插到最前；剔除已不存在的。
 */
export function mergeProjectOrder(saved: string[], diskNames: string[]): string[] {
	const disk = [...new Set(diskNames.map((n) => n.trim()).filter(Boolean))];
	const diskSet = new Set(disk);
	const kept = saved.map((n) => n.trim()).filter((n) => n && diskSet.has(n));
	const keptSet = new Set(kept);
	const fresh = disk.filter((n) => !keptSet.has(n));
	return [...fresh, ...kept];
}

export function mergeBranchOrder(saved: string[], diskNames: string[]): string[] {
	return mergeProjectOrder(saved, diskNames);
}

export function isTypeDirName(name: string): boolean {
	return TYPE_DIR_NAMES.has(name);
}

export function isReservedRootName(name: string): boolean {
	return name === DAILY_REPORT_DIR || name === PROJECT_MATERIALS_DIR || isTypeDirName(name);
}

/** 分支名不可为保留根名 / 类型目录 / 公告历史目录 / 空 */
export function isReservedBranchName(name: string): boolean {
	return !name.trim() || isReservedRootName(name) || name.trim() === NOTICE_HISTORY_DIR;
}

export function isLegacyRootTypeFolder(name: string): boolean {
	return isTypeDirName(name);
}

export function taskDir(root: string, project: string, branch: string, type: TaskType): string {
	const b = branch.trim() || DEFAULT_BRANCH;
	return `${normalizeRoot(root)}/${project.trim()}/${b}/${TYPE_DIR[type]}`;
}

/** 当前结构：根/项目/分支/类型/*.md */
export function isTaskPath(root: string, path: string): boolean {
	const r = normalizeRoot(root);
	if (!path.startsWith(`${r}/`) || !path.toLowerCase().endsWith(".md")) return false;
	const segs = path.slice(r.length + 1).split("/");
	if (segs.length < 4) return false;
	const [project, branch, typeName] = segs;
	if (!project || !branch || !typeName) return false;
	if (isReservedRootName(project) || isReservedBranchName(branch)) return false;
	return isTypeDirName(typeName);
}

/** 中期旧结构：根/项目/类型/*.md（分支落地前） */
export function isMidLegacyTaskPath(root: string, path: string): boolean {
	const r = normalizeRoot(root);
	if (!path.startsWith(`${r}/`) || !path.toLowerCase().endsWith(".md")) return false;
	const segs = path.slice(r.length + 1).split("/");
	if (segs.length < 3) return false;
	// 若第二段是分支、第三段是类型，则已是新结构
	if (segs.length >= 4 && isTypeDirName(segs[2] ?? "")) return false;
	const [project, typeName] = segs;
	if (!project || !typeName) return false;
	if (isReservedRootName(project)) return false;
	return isTypeDirName(typeName);
}

/** 最旧扁平：根/类型/*.md */
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
	if (segs.length >= 4 && isTypeDirName(segs[2] ?? "") && !isReservedRootName(segs[0] ?? "") && !isReservedBranchName(segs[1] ?? "")) {
		return segs[0] ?? null;
	}
	if (segs.length >= 3 && isTypeDirName(segs[1] ?? "") && !isReservedRootName(segs[0] ?? "")) {
		return segs[0] ?? null;
	}
	return null;
}

export function parseBranchFromPath(root: string, path: string): string | null {
	const r = normalizeRoot(root);
	if (!path.startsWith(`${r}/`)) return null;
	const segs = path.slice(r.length + 1).split("/");
	if (segs.length >= 4 && isTypeDirName(segs[2] ?? "") && !isReservedRootName(segs[0] ?? "") && !isReservedBranchName(segs[1] ?? "")) {
		return segs[1] ?? null;
	}
	if (isMidLegacyTaskPath(root, path) || isLegacyTaskPath(root, path)) {
		return DEFAULT_BRANCH;
	}
	return null;
}

/** 新路径取项目；旧扁平路径回落默认项目 */
export function projectFromPath(root: string, path: string): string {
	return parseProjectFromPath(root, path) ?? DEFAULT_PROJECT;
}

/** 新路径取分支；中期/旧扁平回落 main */
export function branchFromPath(root: string, path: string): string {
	return parseBranchFromPath(root, path) ?? DEFAULT_BRANCH;
}

/**
 * 从「项目 - 分支」形式拆名；不符合则 null。
 */
export function suggestSplitProjectName(raw: string): { project: string; branch: string } | null {
	const name = raw.trim();
	const idx = name.indexOf(PROJECT_BRANCH_SPLIT);
	if (idx <= 0) return null;
	const project = name.slice(0, idx).trim();
	const branch = name.slice(idx + PROJECT_BRANCH_SPLIT.length).trim();
	if (!normalizeProjectName(project) || !normalizeBranchName(branch)) return null;
	return { project, branch };
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

/** 项目下子目录名中筛出分支（排除 _资料、类型目录） */
export function listBranchNames(projectChildNames: string[]): string[] {
	const names: string[] = [];
	const seen = new Set<string>();
	for (const raw of projectChildNames) {
		const name = typeof raw === "string" ? raw.trim() : "";
		if (!name || isReservedBranchName(name)) continue;
		if (seen.has(name)) continue;
		seen.add(name);
		names.push(name);
	}
	if (names.length === 0) return [DEFAULT_BRANCH];
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

export function filterByBranch<T extends { branch: string }>(
	items: T[],
	branchFilter: string,
): T[] {
	const q = branchFilter.trim();
	if (!q || q === "all") return items;
	return items.filter((it) => it.branch === q);
}

/** 新建任务默认项目：顶栏筛了具体项目用筛选值，否则取列表首项；无项目则空串由表单必填兜底 */
export function resolveNewTaskProject(projectFilter: string, projects: string[] = []): string {
	const q = projectFilter.trim();
	if (q && q !== "all") return q;
	return projects[0]?.trim() || "";
}

export function resolveNewTaskBranch(branchFilter: string, branches: string[] = []): string {
	const q = branchFilter.trim();
	if (q && q !== "all") return q;
	return branches[0]?.trim() || DEFAULT_BRANCH;
}

/** select 选中值：preferred 在列表中则用它，否则列表首项 */
export function resolveProjectSelectValue(preferred: string, projects: string[]): string {
	const q = preferred.trim();
	if (q && projects.includes(q)) return q;
	return projects[0]?.trim() || "";
}

export function resolveBranchSelectValue(preferred: string, branches: string[]): string {
	const q = preferred.trim();
	if (q && branches.includes(q)) return q;
	return branches[0]?.trim() || DEFAULT_BRANCH;
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

export function normalizeBranchName(raw: string): string | null {
	const name = raw.trim().replace(/[\\/]/g, "").replace(/\s+/g, " ");
	if (!name) return null;
	if (isReservedBranchName(name)) return null;
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

export function canDeleteBranch(
	project: string,
	branch: string,
	tasks: { project: string; branch: string }[],
): { ok: true } | { ok: false; reason: string } {
	const p = project.trim();
	const b = branch.trim();
	if (!p || !normalizeBranchName(b)) {
		return { ok: false, reason: "分支名无效" };
	}
	if (b === DEFAULT_BRANCH) {
		return { ok: false, reason: `不能删除默认分支「${DEFAULT_BRANCH}」` };
	}
	const n = tasks.filter((t) => t.project === p && t.branch === b).length;
	if (n > 0) {
		return {
			ok: false,
			reason: `「${b}」下还有 ${n} 个任务，请先迁移或删除任务后再删分支`,
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

export function prepareRenameBranch(
	from: string,
	rawTo: string,
	branches: string[],
): { ok: true; from: string; to: string } | { ok: false; reason: string } {
	const oldName = from.trim();
	if (!oldName || isReservedBranchName(oldName)) {
		return { ok: false, reason: "原分支名无效" };
	}
	const to = normalizeBranchName(rawTo);
	if (!to) {
		return { ok: false, reason: "分支名无效" };
	}
	if (to === oldName) {
		return { ok: false, reason: "名称未变化" };
	}
	if (branches.includes(to)) {
		return { ok: false, reason: `已存在分支「${to}」` };
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

export function remapPathsAfterBranchRename(
	paths: string[],
	root: string,
	project: string,
	from: string,
	to: string,
): string[] {
	const r = normalizeRoot(root);
	const prefix = `${r}/${project}/${from}/`;
	const nextPrefix = `${r}/${project}/${to}/`;
	return paths.map((p) => (p.startsWith(prefix) ? `${nextPrefix}${p.slice(prefix.length)}` : p));
}

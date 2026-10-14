import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_BRANCH,
	DEFAULT_PROJECT,
	branchFromPath,
	canDeleteProject,
	filterByBranch,
	filterByProject,
	isLegacyRootTypeFolder,
	isMidLegacyTaskPath,
	isTaskPath,
	listBranchNames,
	listProjectNames,
	materialNotePath,
	materialsDir,
	applyPinnedMaterialsFirst,
	mergeMaterialOrder,
	mergeProjectOrder,
	needsLegacyMigration,
	normalizeProjectName,
	formatNoticeHistoryStamp,
	noticeHistoryDir,
	noticeHistoryFilePath,
	noticePath,
	prepareRenameProject,
	projectFromPath,
	remapPathsAfterProjectRename,
	resolveNewTaskProject,
	resolveProjectSelectValue,
	rootFolderNamesFromListing,
	suggestSplitProjectName,
	taskDir,
} from "./project.ts";

test("mergeProjectOrder：新项目置前，已删剔除，相对序保留", () => {
	assert.deepEqual(mergeProjectOrder(["B", "A", "Gone"], ["C", "A", "B"]), ["C", "B", "A"]);
});

test("mergeMaterialOrder：与项目序同一规则", () => {
	assert.deepEqual(
		mergeMaterialOrder(["b.md", "a.md"], ["c.md", "a.md", "b.md"]),
		["c.md", "b.md", "a.md"],
	);
});

test("applyPinnedMaterialsFirst：置顶按序排前，其余保持原序", () => {
	const items = [
		{ name: "a.md", path: "p/a.md" },
		{ name: "b.md", path: "p/b.md" },
		{ name: "c.md", path: "p/c.md" },
	];
	assert.deepEqual(
		applyPinnedMaterialsFirst(items, ["c.md", "a.md"]).map((m) => m.name),
		["c.md", "a.md", "b.md"],
	);
});

test("materialsDir / noticePath / materialNotePath", () => {
	assert.equal(materialsDir("Z-Tasking", "KVAD"), "Z-Tasking/KVAD/_资料");
	assert.equal(noticePath("Z-Tasking", "KVAD", "main"), "Z-Tasking/KVAD/main/公告.md");
	assert.equal(noticePath("Z-Tasking", "KVAD", "V7"), "Z-Tasking/KVAD/V7/公告.md");
	assert.equal(noticeHistoryDir("Z-Tasking", "KVAD", "main"), "Z-Tasking/KVAD/main/_公告历史");
	assert.equal(
		noticeHistoryFilePath("Z-Tasking", "KVAD", "main", "2026-10-14_161205"),
		"Z-Tasking/KVAD/main/_公告历史/2026-10-14_161205.md",
	);
	assert.equal(formatNoticeHistoryStamp(new Date(2026, 9, 14, 16, 12, 5)), "2026-10-14_161205");
	assert.equal(materialNotePath("Z-Tasking", "KVAD", "片段"), "Z-Tasking/KVAD/_资料/片段.md");
	assert.equal(materialNotePath("Z-Tasking", "KVAD", "a/b.md"), "Z-Tasking/KVAD/_资料/ab.md");
});

test("isTaskPath：_资料 下笔记不是任务", () => {
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/KVAD/_资料/片段.md"), false);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/KVAD/main/_资料/片段.md"), false);
});

test("taskDir：项目/分支/类型分层", () => {
	assert.equal(taskDir("Z-Tasking", "KVAD", "main", "long"), "Z-Tasking/KVAD/main/长期");
	assert.equal(taskDir("Z-Tasking/", "桌面", "V7", "bug"), "Z-Tasking/桌面/V7/缺陷");
});

test("isTaskPath：仅认 根/项目/分支/类型/笔记", () => {
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/KVAD/main/长期/a.md"), true);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/KVAD/V7/临时/b.md"), true);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/KVAD/长期/a.md"), false);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/日报/2026-09-22.md"), false);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/长期/a.md"), false);
	assert.equal(isTaskPath("Z-Tasking", "其他/KVAD/main/长期/a.md"), false);
});

test("isMidLegacyTaskPath：根/项目/类型 仍可识别", () => {
	assert.equal(isMidLegacyTaskPath("Z-Tasking", "Z-Tasking/KVAD/长期/a.md"), true);
	assert.equal(isMidLegacyTaskPath("Z-Tasking", "Z-Tasking/KVAD/main/长期/a.md"), false);
});

test("projectFromPath / branchFromPath", () => {
	assert.equal(projectFromPath("Z-Tasking", "Z-Tasking/KVAD/main/长期/a.md"), "KVAD");
	assert.equal(branchFromPath("Z-Tasking", "Z-Tasking/KVAD/main/长期/a.md"), "main");
	assert.equal(projectFromPath("Z-Tasking", "Z-Tasking/终端/缺陷/x.md"), "终端");
	assert.equal(branchFromPath("Z-Tasking", "Z-Tasking/终端/缺陷/x.md"), DEFAULT_BRANCH);
	assert.equal(projectFromPath("Z-Tasking", "Z-Tasking/长期/a.md"), DEFAULT_PROJECT);
	assert.equal(branchFromPath("Z-Tasking", "Z-Tasking/长期/a.md"), DEFAULT_BRANCH);
});

test("suggestSplitProjectName / listBranchNames", () => {
	assert.deepEqual(suggestSplitProjectName("mc - V7R023F33C01"), {
		project: "mc",
		branch: "V7R023F33C01",
	});
	assert.equal(suggestSplitProjectName("KVAD"), null);
	assert.deepEqual(listBranchNames(["main", "_资料", "长期", "V7"]), ["V7", "main"].sort((a, b) => a.localeCompare(b, "zh")));
});

test("needsLegacyMigration：根下仍有类型目录则要迁", () => {
	assert.equal(needsLegacyMigration(["长期", "临时", "日报"]), true);
	assert.equal(needsLegacyMigration(["KVAD", "日报"]), false);
	assert.equal(needsLegacyMigration(["缺陷"]), true);
});

test("isLegacyRootTypeFolder：识别根下旧类型名", () => {
	assert.equal(isLegacyRootTypeFolder("长期"), true);
	assert.equal(isLegacyRootTypeFolder("KVAD"), false);
	assert.equal(isLegacyRootTypeFolder("日报"), false);
});

test("listProjectNames：子目录去保留名与旧类型；按中文名排序（不置顶 KVAD）", () => {
	assert.deepEqual(
		listProjectNames(["KVAD", "日报", "长期", "终端"]),
		["KVAD", "终端"].sort((a, b) => a.localeCompare(b, "zh")),
	);
});

test("listProjectNames：无任何项目时回落默认 KVAD（空库种子）", () => {
	assert.deepEqual(listProjectNames(["日报"]), [DEFAULT_PROJECT]);
	assert.deepEqual(listProjectNames([]), [DEFAULT_PROJECT]);
});

test("listProjectNames：磁盘上没有 KVAD 时不强行插入", () => {
	assert.deepEqual(listProjectNames(["KVAD66", "日报"]), ["KVAD66"]);
	const names = listProjectNames(["公共类项目", "KVAD66", "终端"]);
	assert.equal(names.includes("KVAD"), false);
	assert.deepEqual(new Set(names), new Set(["KVAD66", "公共类项目", "终端"]));
	assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "zh")));
});

test("listProjectNames：文件夹与任务来源重复时去重，按名排序", () => {
	assert.deepEqual(
		listProjectNames(["公共类项目", "KVAD", "公共类项目", "终端", "终端"]),
		[DEFAULT_PROJECT, "公共类项目", "终端"].sort((a, b) => a.localeCompare(b, "zh")),
	);
});

test("filterByProject：全部不过滤，指定项目只留同名", () => {
	const items = [
		{ project: "KVAD", title: "a" },
		{ project: "终端", title: "b" },
	];
	assert.deepEqual(filterByProject(items, "all"), items);
	assert.deepEqual(filterByProject(items, "终端"), [{ project: "终端", title: "b" }]);
});

test("filterByBranch：全部不过滤，指定分支只留同名", () => {
	const items = [
		{ branch: "main", title: "a" },
		{ branch: "V7", title: "b" },
	];
	assert.deepEqual(filterByBranch(items, "all"), items);
	assert.deepEqual(filterByBranch(items, "V7"), [{ branch: "V7", title: "b" }]);
});

test("resolveNewTaskProject：筛选非全部时用筛选值，否则用列表首项", () => {
	assert.equal(resolveNewTaskProject("终端", ["公共类", "终端"]), "终端");
	assert.equal(resolveNewTaskProject("all", ["公共类", "终端"]), "公共类");
	assert.equal(resolveNewTaskProject("", ["终端", "公共类"]), "终端");
	assert.equal(resolveNewTaskProject("all", []), "");
	assert.equal(resolveNewTaskProject("all"), "");
});

test("resolveProjectSelectValue：优先 preferred，否则列表首项", () => {
	assert.equal(resolveProjectSelectValue("终端", ["公共类", "终端"]), "终端");
	assert.equal(resolveProjectSelectValue("不存在", ["公共类", "终端"]), "公共类");
	assert.equal(resolveProjectSelectValue("", ["终端"]), "终端");
	assert.equal(resolveProjectSelectValue("x", []), "");
});

test("canDeleteProject：有任务则禁止删除", () => {
	assert.deepEqual(
		canDeleteProject("终端", [{ project: "终端" }, { project: "公共类" }]),
		{ ok: false, reason: "「终端」下还有 1 个任务，请先迁移或删除任务后再删项目" },
	);
	assert.deepEqual(canDeleteProject("公共类", [{ project: "终端" }]), { ok: true });
	assert.deepEqual(canDeleteProject("日报", []), { ok: false, reason: "项目名无效（不能是「日报 / 长期 / 临时 / 缺陷」）" });
});

test("prepareRenameProject：校验新名与冲突", () => {
	assert.deepEqual(
		prepareRenameProject("终端", "终端安全", ["终端", "公共类"]),
		{ ok: true, from: "终端", to: "终端安全" },
	);
	assert.equal(prepareRenameProject("终端", "公共类", ["终端", "公共类"]).ok, false);
	assert.equal(prepareRenameProject("终端", "日报", ["终端"]).ok, false);
	assert.equal(prepareRenameProject("终端", "  ", ["终端"]).ok, false);
	assert.equal(prepareRenameProject("终端", "终端", ["终端"]).ok, false);
});

test("remapPathsAfterProjectRename：只改该项目前缀路径", () => {
	assert.deepEqual(
		remapPathsAfterProjectRename(
			[
				"Z-Tasking/终端/长期/a.md",
				"Z-Tasking/公共类/临时/b.md",
				"Z-Tasking/终端安全/长期/c.md",
			],
			"Z-Tasking",
			"终端",
			"终端安全",
		),
		[
			"Z-Tasking/终端安全/长期/a.md",
			"Z-Tasking/公共类/临时/b.md",
			"Z-Tasking/终端安全/长期/c.md",
		],
	);
});

test("normalizeProjectName：去空白与非法名；_资料 保留", () => {
	assert.equal(normalizeProjectName("_资料"), null);
	assert.equal(normalizeProjectName("  终端安全  "), "终端安全");
	assert.equal(normalizeProjectName(""), null);
	assert.equal(normalizeProjectName("日报"), null);
	assert.equal(normalizeProjectName("长期"), null);
	assert.equal(normalizeProjectName("a/b"), "ab");
});

test("rootFolderNamesFromListing：从 adapter.list 的文件夹路径取根下子目录名", () => {
	assert.deepEqual(
		rootFolderNamesFromListing("Z-Tasking", [
			"Z-Tasking/KVAD",
			"Z-Tasking/日报",
			"Z-Tasking/公共类项目",
			"Z-Tasking/KVAD/长期",
		]),
		["KVAD", "日报", "公共类项目"],
	);
	assert.deepEqual(
		rootFolderNamesFromListing("Z-Tasking/", ["Z-Tasking/终端", "其他/忽略"]),
		["终端"],
	);
	assert.deepEqual(rootFolderNamesFromListing("Z-Tasking", []), []);
});

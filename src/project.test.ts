import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_PROJECT,
	canDeleteProject,
	filterByProject,
	isLegacyRootTypeFolder,
	isTaskPath,
	listProjectNames,
	needsLegacyMigration,
	normalizeProjectName,
	prepareRenameProject,
	projectFromPath,
	remapPathsAfterProjectRename,
	resolveNewTaskProject,
	resolveProjectSelectValue,
	rootFolderNamesFromListing,
	taskDir,
} from "./project.ts";

test("taskDir：项目/类型分层", () => {
	assert.equal(taskDir("Z-Tasking", "KVAD", "long"), "Z-Tasking/KVAD/长期");
	assert.equal(taskDir("Z-Tasking/", "桌面", "bug"), "Z-Tasking/桌面/缺陷");
});

test("isTaskPath：仅认 根/项目/类型/笔记", () => {
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/KVAD/长期/a.md"), true);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/KVAD/临时/b.md"), true);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/日报/2026-09-22.md"), false);
	assert.equal(isTaskPath("Z-Tasking", "Z-Tasking/长期/a.md"), false);
	assert.equal(isTaskPath("Z-Tasking", "其他/KVAD/长期/a.md"), false);
});

test("projectFromPath：从路径取项目；旧扁平回落默认项目", () => {
	assert.equal(projectFromPath("Z-Tasking", "Z-Tasking/KVAD/长期/a.md"), "KVAD");
	assert.equal(projectFromPath("Z-Tasking", "Z-Tasking/终端/缺陷/x.md"), "终端");
	assert.equal(projectFromPath("Z-Tasking", "Z-Tasking/长期/a.md"), DEFAULT_PROJECT);
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

test("normalizeProjectName：去空白与非法名", () => {
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

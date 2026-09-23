import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_PROJECT,
	filterByProject,
	isLegacyRootTypeFolder,
	isTaskPath,
	listProjectNames,
	needsLegacyMigration,
	normalizeProjectName,
	projectFromPath,
	resolveNewTaskProject,
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

test("listProjectNames：子目录去保留名与旧类型，默认含 KVAD", () => {
	assert.deepEqual(
		listProjectNames(["KVAD", "日报", "长期", "终端"]),
		["KVAD", "终端"],
	);
	assert.deepEqual(listProjectNames(["日报"]), [DEFAULT_PROJECT]);
});

test("listProjectNames：文件夹与任务来源重复时去重", () => {
	assert.deepEqual(
		listProjectNames(["公共类项目", "KVAD", "公共类项目", "终端", "终端"]),
		[DEFAULT_PROJECT, "公共类项目", "终端"],
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

test("resolveNewTaskProject：筛选非全部时用筛选值，否则默认 KVAD", () => {
	assert.equal(resolveNewTaskProject("终端"), "终端");
	assert.equal(resolveNewTaskProject("all"), DEFAULT_PROJECT);
	assert.equal(resolveNewTaskProject(""), DEFAULT_PROJECT);
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

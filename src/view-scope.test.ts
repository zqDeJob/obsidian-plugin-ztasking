import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isTopTabChange,
	markdownPaintRootSelectors,
	pageIdForScopeView,
	shellRenderTargets,
	topTabForScopeView,
} from "./view-scope.ts";

test("pageIdForScopeView：detail 并入 board", () => {
	assert.equal(pageIdForScopeView("detail"), "board");
	assert.equal(pageIdForScopeView("report"), "report");
	assert.equal(pageIdForScopeView("gantt"), "gantt");
});

test("topTabForScopeView：cal/gantt 同属 schedule", () => {
	assert.equal(topTabForScopeView("cal"), "schedule");
	assert.equal(topTabForScopeView("gantt"), "schedule");
	assert.equal(topTabForScopeView("board"), "work");
	assert.equal(topTabForScopeView("report"), "report");
	assert.equal(topTabForScopeView("help"), "help");
});

test("isTopTabChange：同 schedule 内 cal↔gantt 不算顶栏切换", () => {
	assert.equal(isTopTabChange("cal", "schedule"), false);
	assert.equal(isTopTabChange("gantt", "schedule"), false);
	assert.equal(isTopTabChange("report", "work"), true);
	assert.equal(isTopTabChange("board", "report"), true);
	assert.equal(isTopTabChange("report", "report"), false);
});

test("markdownPaintRootSelectors：只含当前页；抽屉打开时追加 detail", () => {
	assert.deepEqual(markdownPaintRootSelectors("report", false), ["#ztk-view-report"]);
	assert.deepEqual(markdownPaintRootSelectors("board", false), ["#ztk-view-board"]);
	assert.deepEqual(markdownPaintRootSelectors("detail", false), ["#ztk-view-board"]);
	assert.deepEqual(markdownPaintRootSelectors("report", true), [
		"#ztk-view-report",
		".ztk-detail-drawer .ztk-detail",
	]);
	assert.deepEqual(markdownPaintRootSelectors("cal", true), [
		"#ztk-view-cal",
		".ztk-detail-drawer .ztk-detail",
	]);
});

test("shellRenderTargets：每次只刷当前壳", () => {
	assert.deepEqual(shellRenderTargets("report"), ["report"]);
	assert.deepEqual(shellRenderTargets("board"), ["board"]);
	assert.deepEqual(shellRenderTargets("detail"), ["board"]);
	assert.deepEqual(shellRenderTargets("cal"), ["cal"]);
	assert.deepEqual(shellRenderTargets("gantt"), ["gantt"]);
	assert.deepEqual(shellRenderTargets("web"), ["web"]);
	assert.deepEqual(shellRenderTargets("help"), ["help"]);
});

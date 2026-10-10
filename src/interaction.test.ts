import assert from "node:assert/strict";
import { test } from "node:test";
import { CLICK_WHILE_SELECTING, shouldIgnoreClickWhileSelecting } from "./interaction.ts";

test("点击白名单包含侧栏任务与 data-act", () => {
	assert.match(CLICK_WHILE_SELECTING, /\.ztk-task/);
	assert.match(CLICK_WHILE_SELECTING, /\[data-act\]/);
	assert.match(CLICK_WHILE_SELECTING, /\.ztk-composer/);
});

test("无选区时不拦截", () => {
	assert.equal(shouldIgnoreClickWhileSelecting({ closest: () => null }, ""), false);
	assert.equal(shouldIgnoreClickWhileSelecting({ closest: () => null }, "   "), false);
});

test("有选区且命中控件时不拦截", () => {
	assert.equal(shouldIgnoreClickWhileSelecting({ closest: () => ({}) }, "残留选区"), false);
});

test("有选区且未命中控件时拦截", () => {
	assert.equal(shouldIgnoreClickWhileSelecting({ closest: () => null }, "一段正文"), true);
	assert.equal(shouldIgnoreClickWhileSelecting(null, "一段正文"), true);
});

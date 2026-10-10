import assert from "node:assert/strict";
import { test } from "node:test";
import { isComposerFieldId, shouldDeferExternalRefresh } from "./refresh-guard.ts";

test("焦点在记今天文本框时推迟 refresh", () => {
	assert.equal(shouldDeferExternalRefresh({
		focusedId: "ztk-log-text",
		draftText: "",
		draftHours: "",
	}), true);
});

test("焦点在工时输入时推迟 refresh", () => {
	assert.equal(shouldDeferExternalRefresh({
		focusedId: "ztk-log-hours",
		draftText: "",
		draftHours: "",
	}), true);
});

test("有未提交草稿时推迟 refresh", () => {
	assert.equal(shouldDeferExternalRefresh({
		focusedId: null,
		draftText: "写了一半",
		draftHours: "",
	}), true);
	assert.equal(shouldDeferExternalRefresh({
		focusedId: "other",
		draftText: "",
		draftHours: "1.5",
	}), true);
});

test("isComposerFieldId 仅匹配记今天与工时", () => {
	assert.equal(isComposerFieldId("ztk-log-text"), true);
	assert.equal(isComposerFieldId("ztk-log-hours"), true);
	assert.equal(isComposerFieldId("ztk-task-status"), false);
	assert.equal(isComposerFieldId(null), false);
});

test("空闲时可 refresh", () => {
	assert.equal(shouldDeferExternalRefresh({
		focusedId: null,
		draftText: "",
		draftHours: "",
	}), false);
	assert.equal(shouldDeferExternalRefresh({
		focusedId: "ztk-task-status",
		draftText: "  ",
		draftHours: "  ",
	}), false);
});

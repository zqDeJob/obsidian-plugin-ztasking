import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightPlainText } from "./report.ts";

test("highlightPlainText：空关键字只转义", () => {
	assert.equal(highlightPlainText("插件<script>", ""), "插件&lt;script&gt;");
});

test("highlightPlainText：匹配字包 mark，保留原文大小写", () => {
	assert.equal(
		highlightPlainText("任务台任务", "任务"),
		'<mark class="ztk-hl">任务</mark>台<mark class="ztk-hl">任务</mark>',
	);
});

test("highlightPlainText：大小写不敏感", () => {
	assert.equal(
		highlightPlainText("Task TASK", "task"),
		'<mark class="ztk-hl">Task</mark> <mark class="ztk-hl">TASK</mark>',
	);
});

test("highlightPlainText：无匹配原样转义", () => {
	assert.equal(highlightPlainText("进展明细", "xyz"), "进展明细");
});

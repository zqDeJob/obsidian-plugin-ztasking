import assert from "node:assert/strict";
import { test } from "node:test";
import { descBlockHtml } from "./desc.ts";

test("浏览态显示编辑按钮和 markdown 槽", () => {
	const html = descBlockHtml({ editing: false, desc: "这是说明", path: "z-tasking/长期/a.md" });
	assert.match(html, /data-act="edit-desc"/);
	assert.match(html, /data-act="copy-desc"/);
	assert.match(html, /data-kind="desc"/);
	assert.equal(html.includes('data-act="save-desc"'), false);
});

test("编辑态显示文本框和保存取消，并转义原文", () => {
	const html = descBlockHtml({ editing: true, desc: "旧<说明>", path: "z-tasking/长期/a.md" });
	assert.match(html, /<textarea/);
	assert.match(html, /旧&lt;说明&gt;/);
	assert.match(html, /data-act="save-desc"/);
	assert.match(html, /data-act="cancel-desc"/);
});

test("空描述浏览态给占位文案", () => {
	const html = descBlockHtml({ editing: false, desc: "  ", path: "z-tasking/长期/a.md" });
	assert.match(html, /还没有说明/);
	assert.equal(html.includes("ztk-md"), false);
	assert.match(html, /data-act="edit-desc"/);
});

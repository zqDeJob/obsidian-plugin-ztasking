import assert from "node:assert/strict";
import { test } from "node:test";
import { searchFieldHtml } from "./icons.ts";

test("searchFieldHtml：左侧搜索图标 + 右侧清除按钮", () => {
	const html = searchFieldHtml({
		inputClass: "ztk-search",
		placeholder: "搜索标题或说明",
		value: "关键字",
		ariaLabel: "搜索任务",
	});
	assert.match(html, /class="ztk-search-field has-value"/);
	assert.match(html, /ztk-search-field-icon/);
	assert.match(html, /class="ztk-search"/);
	assert.match(html, /value="关键字"/);
	assert.match(html, /data-act="clear-search"/);
	assert.match(html, /ztk-search-clear/);
	assert.match(html, /aria-label="清除搜索"/);
	assert.doesNotMatch(html, /\shidden/);
});

test("searchFieldHtml：空值时清除按钮 hidden", () => {
	const html = searchFieldHtml({
		inputClass: "ztk-report-search",
		placeholder: "搜索进展",
		value: "",
	});
	assert.match(html, /class="ztk-search-field"/);
	assert.doesNotMatch(html, /has-value/);
	assert.match(html, /\shidden/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCopyText } from "./clipboard.ts";

test("normalizeCopyText 去掉首尾空白，保留中间换行", () => {
	assert.equal(normalizeCopyText("  hello\nworld  \n"), "hello\nworld");
	assert.equal(normalizeCopyText("   "), "");
});

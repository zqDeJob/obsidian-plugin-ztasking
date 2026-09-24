import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_BRAT_REPO, helpCenterHtml, helpNavGroups } from "./help.ts";

test("helpNavGroups：四类锚点分组", () => {
	const groups = helpNavGroups();
	assert.deepEqual(groups.map((g) => g.id), ["basics", "report", "work", "sync"]);
	assert.equal(groups.find((g) => g.id === "sync")?.items.length, 1);
	assert.ok((groups.find((g) => g.id === "report")?.items.length ?? 0) >= 4);
});

test("helpCenterHtml：侧栏锚点 + 分组正文；BRAT 单独一卡", () => {
	const html = helpCenterHtml();
	assert.match(html, /帮助中心/);
	assert.match(html, /ztk-help-nav/);
	assert.match(html, /ztk-help-layout/);
	assert.match(html, /help-group-basics/);
	assert.match(html, /help-group-report/);
	assert.match(html, /help-group-work/);
	assert.match(html, /help-group-sync/);
	assert.match(html, /data-act="help-anchor"/);
	assert.match(html, /id="help-project"/);
	assert.match(html, /id="help-report-logs"/);
	assert.match(html, /id="help-work-detail"/);
	assert.match(html, /id="help-brat"/);
	assert.equal((html.match(/id="help-brat"/g) ?? []).length, 1);
	assert.match(html, new RegExp(HELP_BRAT_REPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(html, /Check for updates/);
});

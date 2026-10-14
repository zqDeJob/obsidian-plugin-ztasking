import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "./model.ts";
import {
	advAddGroup,
	advAddRule,
	advClear,
	advRemoveNode,
	advToggleGroupMode,
	advUpdateRule,
	countEffectiveAdvRules,
	emptyCatalogAdvGroup,
	emptyCatalogAdvRule,
	matchCatalogAdvNode,
	matchCatalogAdvRule,
	matchCatalogAdvRoot,
} from "./catalog-filter.ts";

function task(partial: Partial<Task> & Pick<Task, "title">): Task {
	return {
		id: partial.id ?? "a.md",
		path: partial.path ?? "a.md",
		title: partial.title,
		project: partial.project ?? "KVAD",
		branch: partial.branch ?? "main",
		type: partial.type ?? "long",
		status: partial.status ?? "doing",
		start: partial.start ?? "2026-01-01",
		end: partial.end ?? "2026-12-31",
		desc: partial.desc ?? "",
		logs: partial.logs ?? [],
		updatedAt: partial.updatedAt ?? 0,
	};
}

test("matchCatalogAdvRule：状态包含/不包含", () => {
	const t = task({ title: "A", status: "done" });
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "status", op: "include", value: "done" })), true);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "status", op: "exclude", value: "done" })), false);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "status", op: "include", value: "todo" })), false);
});

test("matchCatalogAdvRule：标题包含；项目精确匹配", () => {
	const t = task({ title: "AIMPV3 联调", project: "终端安全" });
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "title", op: "include", value: "aimp" })), true);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "title", op: "exclude", value: "联调" })), false);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "project", op: "include", value: "终端安全" })), true);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "project", op: "include", value: "KVAD" })), false);
});

test("matchCatalogAdvRule：周期重叠单日；进展笔数；工时", () => {
	const t = task({
		title: "X",
		start: "2026-10-01",
		end: "2026-10-10",
		logs: [
			{ date: "2026-10-02", text: "a", hours: 1 },
			{ date: "2026-10-03", text: "b", hours: 0.5 },
		],
	});
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "period", op: "include", value: "2026-10-05" })), true);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "period", op: "include", value: "2026-11-01" })), false);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "count", op: "include", value: "2" })), true);
	assert.equal(matchCatalogAdvRule(t, emptyCatalogAdvRule({ column: "hours", op: "include", value: "1.5" })), true);
});

test("matchCatalogAdvRoot：且/或；空值忽略；空树放行", () => {
	const t = task({ title: "插件", status: "doing", type: "temp" });
	const rootAll = emptyCatalogAdvGroup({
		mode: "all",
		children: [
			emptyCatalogAdvRule({ column: "status", op: "include", value: "doing" }),
			emptyCatalogAdvRule({ column: "type", op: "include", value: "bug" }),
			emptyCatalogAdvRule({ column: "title", op: "include", value: "" }),
		],
	});
	const rootAny = { ...rootAll, mode: "any" as const };
	assert.equal(countEffectiveAdvRules(rootAll), 2);
	assert.equal(matchCatalogAdvRoot(t, rootAll), false);
	assert.equal(matchCatalogAdvRoot(t, rootAny), true);
	assert.equal(matchCatalogAdvRoot(t, emptyCatalogAdvGroup()), true);
});

test("matchCatalogAdvNode：嵌套条件组（根且 + 子或）", () => {
	const t = task({ title: "插件", status: "doing", type: "temp", project: "KVAD" });
	const root = emptyCatalogAdvGroup({
		mode: "all",
		children: [
			emptyCatalogAdvRule({ column: "status", op: "include", value: "doing" }),
			emptyCatalogAdvGroup({
				mode: "any",
				children: [
					emptyCatalogAdvRule({ column: "type", op: "include", value: "bug" }),
					emptyCatalogAdvRule({ column: "project", op: "include", value: "KVAD" }),
				],
			}),
		],
	});
	assert.equal(matchCatalogAdvRoot(t, root), true);
	assert.equal(countEffectiveAdvRules(root), 3);
	const miss = task({ title: "插件", status: "doing", type: "long", project: "其他" });
	assert.equal(matchCatalogAdvRoot(miss, root), false);
});

test("树操作：添加条件/条件组、切换且或、删除、清空；深度限制", () => {
	let root = emptyCatalogAdvGroup();
	root = advAddRule(root, root.id);
	assert.equal(root.children.length, 1);
	assert.equal(root.children[0]?.kind, "rule");

	root = advAddGroup(root, root.id);
	assert.equal(root.children.length, 2);
	const sub = root.children[1];
	assert.ok(sub && sub.kind === "group");
	assert.equal(sub.children.length, 1);

	const nested = advAddGroup(root, sub.id);
	assert.deepEqual(nested, root);

	root = advToggleGroupMode(root, root.id);
	assert.equal(root.mode, "any");

	const ruleId = root.children[0]!.id;
	root = advUpdateRule(root, ruleId, "column", "title");
	root = advUpdateRule(root, ruleId, "op", "exclude");
	root = advUpdateRule(root, ruleId, "value", "x");
	const updated = root.children[0];
	assert.ok(updated && updated.kind === "rule");
	assert.equal(updated.column, "title");
	assert.equal(updated.op, "exclude");
	assert.equal(updated.value, "x");

	root = advRemoveNode(root, sub.id);
	assert.equal(root.children.length, 1);
	root = advClear(root);
	assert.equal(root.children.length, 0);
	assert.equal(matchCatalogAdvNode(task({ title: "x" }), root), true);
});

/** 「我的今天」手动顺序：按日期记任务 id。 */

export type TodayDigestOrder = {
	date: string;
	ids: string[];
};

/** 已保存顺序优先；当天新增的条目接在末尾。日期不一致或没有保存时保持原顺序。 */
export function mergeTodayOrder(
	naturalIds: string[],
	saved: TodayDigestOrder | undefined,
	today: string,
): string[] {
	if (!saved || saved.date !== today || saved.ids.length === 0) return [...naturalIds];
	const present = new Set(naturalIds);
	const kept = saved.ids.filter((id) => present.has(id));
	const known = new Set(kept);
	const fresh = naturalIds.filter((id) => !known.has(id));
	return [...kept, ...fresh];
}

export function orderByTodayIds<T extends { id: string }>(
	items: T[],
	saved: TodayDigestOrder | undefined,
	today: string,
): T[] {
	const order = mergeTodayOrder(items.map((it) => it.id), saved, today);
	const map = new Map(items.map((it) => [it.id, it]));
	return order.flatMap((id) => {
		const it = map.get(id);
		return it ? [it] : [];
	});
}

/** 未分组时可任意换位；按项目时只能在同一项目内拖。 */
export function todayDropAllowed(
	groupByProject: boolean,
	fromProject: string,
	toProject: string,
): boolean {
	if (!groupByProject) return true;
	return fromProject === toProject;
}

export function todayProjectKey(project?: string): string {
	return (project ?? "").trim() || "未分组";
}

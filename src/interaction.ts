/**
 * 有文字选区时仍应响应点击的控件（侧栏任务卡、记一笔等）。
 * 正文区拖选时忽略「空白处」点击，避免误切任务。
 */
export const CLICK_WHILE_SELECTING =
	"button, a, textarea, input, select, label, [data-act], .ztk-task, .ztk-day, [data-gid], .ztk-chip, .ztk-tabs, .ztk-work-rail, .ztk-splitter, .ztk-drag-handle, .ztk-period, .ztk-composer";

type ClosestEl = { closest: (selectors: string) => unknown };

/**
 * 为方便复制：拖选正文时忽略非控件点击。
 * 侧栏任务 / 记一笔等必须始终可点——否则改状态后若残留选区，列表会像卡死。
 */
export function shouldIgnoreClickWhileSelecting(
	target: ClosestEl | null,
	selectedText: string,
	clickableSelector = CLICK_WHILE_SELECTING,
): boolean {
	if (!selectedText.trim()) return false;
	if (!target) return true;
	if (target.closest(clickableSelector)) return false;
	return true;
}

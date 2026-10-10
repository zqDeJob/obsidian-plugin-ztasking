/**
 * 外部 vault refresh 是否应跳过整页重绘（保护「记今天」输入中）。
 * focusedId：当前 document.activeElement.id
 * draftText / draftHours：输入框里已有未提交内容
 */
export function shouldDeferExternalRefresh(input: {
	focusedId: string | null;
	draftText: string;
	draftHours: string;
}): boolean {
	if (isComposerFieldId(input.focusedId)) return true;
	if (input.draftText.trim() || input.draftHours.trim()) return true;
	return false;
}

export function isComposerFieldId(id: string | null | undefined): boolean {
	return id === "ztk-log-text" || id === "ztk-log-hours";
}

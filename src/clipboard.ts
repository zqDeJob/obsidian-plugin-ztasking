/** 规范化待复制文本；空串表示无可复制内容。 */
export function normalizeCopyText(text: string): string {
	return text.replace(/^\s+|\s+$/g, "");
}

/** 写入系统剪贴板；优先 Clipboard API，失败则降级 execCommand。 */
export async function copyText(text: string): Promise<boolean> {
	const value = normalizeCopyText(text);
	if (!value) return false;
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = value;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.left = "-9999px";
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand("copy");
			ta.remove();
			return ok;
		} catch {
			return false;
		}
	}
}

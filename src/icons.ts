/** 行内 SVG 图标按钮（复制 / 编辑 / 删除 / 保存 / 取消） */

const SVG = {
	copy: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
	edit: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
	del: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
	save: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
	cancel: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
} as const;

/** 内联色，避免被 Obsidian 主题 button 样式盖掉 */
const STYLE: Record<IconKind, string> = {
	copy: "background:#e7f2f0;background-color:#e7f2f0;color:#2f6f68",
	edit: "background:#f3ebe3;background-color:#f3ebe3;color:#a85a2a",
	del: "background:#d32f2f;background-color:#d32f2f;color:#ffffff",
	save: "background:#2f6f68;background-color:#2f6f68;color:#ffffff",
	cancel: "background:#ececec;background-color:#ececec;color:#5c5c5c",
};

export type IconKind = keyof typeof SVG;

export function iconBtn(act: string, kind: IconKind, label: string): string {
	return `<button type="button" class="ztk-icon-btn ztk-icon-btn--${kind}" data-act="${act}" title="${label}" aria-label="${label}" style="${STYLE[kind]}">${SVG[kind]}</button>`;
}

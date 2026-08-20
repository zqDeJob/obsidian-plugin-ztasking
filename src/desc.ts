import { esc } from "./model.ts";
import { iconBtn } from "./icons.ts";
import { mdSlotHtml } from "./report.ts";

export function descBlockHtml(opts: { editing: boolean; desc: string; path: string }): string {
	if (opts.editing) {
		return `<div class="ztk-desc">
			<textarea class="ztk-desc-edit" id="ztk-desc-text" placeholder="说明：这件事项要达成什么">${esc(opts.desc)}</textarea>
			<div class="ztk-log-actions">
				${iconBtn("save-desc", "save", "保存")}
				${iconBtn("cancel-desc", "cancel", "取消")}
			</div>
		</div>`;
	}
	const body = opts.desc.trim()
		? mdSlotHtml(opts.path, "", "desc")
		: `<p class="ztk-muted">还没有说明</p>`;
	return `<div class="ztk-desc">
		<div class="ztk-desc-body">${body}</div>
		<div class="ztk-log-actions">
			${iconBtn("copy-desc", "copy", "复制")}
			${iconBtn("edit-desc", "edit", "编辑")}
		</div>
	</div>`;
}

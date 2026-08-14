import { esc } from "./model.ts";
import { mdSlotHtml } from "./report.ts";

export function descBlockHtml(opts: { editing: boolean; desc: string; path: string }): string {
	if (opts.editing) {
		return `<div class="ztk-desc">
			<textarea class="ztk-desc-edit" id="ztk-desc-text" placeholder="说明：这件事项要达成什么">${esc(opts.desc)}</textarea>
			<div class="ztk-log-actions">
				<button class="ztk-btn" data-act="save-desc" type="button">保存</button>
				<button class="ztk-ghost" data-act="cancel-desc" type="button">取消</button>
			</div>
		</div>`;
	}
	const body = opts.desc.trim()
		? mdSlotHtml(opts.path, "", "desc")
		: `<p class="ztk-muted">还没有说明</p>`;
	return `<div class="ztk-desc">
		<div class="ztk-desc-body">${body}</div>
		<div class="ztk-log-actions">
			<button class="ztk-ghost" data-act="copy-desc" type="button">复制</button>
			<button class="ztk-ghost" data-act="edit-desc" type="button">编辑</button>
		</div>
	</div>`;
}

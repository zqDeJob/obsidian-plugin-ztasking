import {
	TYPE_DIR,
	formatHours,
	isStatus,
	isType,
	type Task,
	type TaskLog,
	type TaskStatus,
	type TaskType,
} from "./model.ts";

function parseFrontmatter(content: string): { fields: Record<string, string>; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { fields: {}, body: content };
	const fields: Record<string, string> = {};
	for (const line of (match[1] ?? "").split(/\r?\n/)) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (kv?.[1]) fields[kv[1]] = (kv[2] ?? "").trim();
	}
	return { fields, body: content.slice(match[0].length) };
}

function typeFromPath(path: string, fallback: TaskType): TaskType {
	if (path.includes(`/${TYPE_DIR.temp}/`) || path.endsWith(`/${TYPE_DIR.temp}`)) return "temp";
	if (path.includes(`/${TYPE_DIR.long}/`)) return "long";
	return fallback;
}

/** 解析进展标题：`### [[YYYY-MM-DD]]` 或 `### [[YYYY-MM-DD]] 1.5h` */
export function parseLogHeading(line: string): { date: string; hours?: number } | null {
	const m = line.match(
		/^###\s+(?:\[\[)?(\d{4}-\d{2}-\d{2})(?:\]\])?(?:\s+(\d+(?:\.\d+)?)\s*h)?\s*$/i,
	);
	if (!m?.[1]) return null;
	const hoursRaw = m[2];
	if (hoursRaw === undefined) return { date: m[1] };
	const hours = Number(hoursRaw);
	if (!Number.isFinite(hours) || hours <= 0) return { date: m[1] };
	return { date: m[1], hours: Math.round(hours * 1000) / 1000 };
}

function parseLogs(progressBody: string): TaskLog[] {
	const logs: TaskLog[] = [];
	const re = /^###\s+(?:\[\[)?(\d{4}-\d{2}-\d{2})(?:\]\])?(?:\s+(\d+(?:\.\d+)?)\s*h)?\s*$/gim;
	const matches = [...progressBody.matchAll(re)];
	for (let i = 0; i < matches.length; i++) {
		const cur = matches[i];
		const next = matches[i + 1];
		if (!cur || cur.index === undefined) continue;
		const heading = parseLogHeading(cur[0].trim());
		if (!heading) continue;
		const start = cur.index + cur[0].length;
		const end = next?.index ?? progressBody.length;
		const entry: TaskLog = {
			date: heading.date,
			text: progressBody.slice(start, end).trim(),
		};
		if (heading.hours !== undefined) entry.hours = heading.hours;
		logs.push(entry);
	}
	return logs;
}

export function parseTaskMarkdown(path: string, content: string): Task {
	const { fields, body } = parseFrontmatter(content);
	const type = typeFromPath(path, isType(fields.type ?? "") ? fields.type as TaskType : "long");
	const status: TaskStatus = isStatus(fields.status ?? "") ? fields.status as TaskStatus : "todo";
	const parts = body.split(/^## 进展\s*$/m);
	const desc = (parts[0] ?? "").trim();
	const logs = parseLogs(parts[1] ?? "");
	const file = path.split("/").pop() ?? path;
	return {
		id: path,
		path,
		title: file.replace(/\.md$/i, ""),
		type,
		status,
		start: fields.start || "",
		end: fields.end || "",
		desc,
		logs,
		updatedAt: 0,
	};
}

export function serializeLogHeading(log: TaskLog): string {
	const hours = log.hours !== undefined && log.hours > 0 ? ` ${formatHours(log.hours)}` : "";
	return `### [[${log.date}]]${hours}`;
}

/** 「记一笔」：无当日进展则新增；已有则追加正文并累加工时（不覆盖） */
export function appendTaskLog(
	logs: TaskLog[],
	date: string,
	text: string,
	hours: number,
): TaskLog[] {
	const trimmed = text.trim();
	const existing = logs.find((l) => l.date === date);
	if (!existing) {
		return [...logs, { date, text: trimmed, hours }];
	}
	const prev = existing.text.trim();
	const mergedText = prev ? `${prev}\n\n${trimmed}` : trimmed;
	const mergedHours = Math.round(((existing.hours ?? 0) + hours) * 1000) / 1000;
	return logs.map((l) =>
		l.date === date ? { date, text: mergedText, hours: mergedHours } : l,
	);
}

export function serializeTaskMarkdown(task: Task): string {
	const logs = [...task.logs].sort((a, b) => b.date.localeCompare(a.date));
	const logBlock = logs.length
		? logs.map((l) => `${serializeLogHeading(l)}\n${l.text}`).join("\n\n")
		: "";
	return [
		"---",
		`type: ${task.type}`,
		`status: ${task.status}`,
		`start: ${task.start}`,
		`end: ${task.end}`,
		"---",
		"",
		task.desc.trim(),
		"",
		"## 进展",
		"",
		logBlock,
		"",
	].join("\n");
}

# Z-Tasking

Obsidian 插件：长期 / 临时任务台。每个任务是一篇 Markdown 笔记，支持工作台记进展、全量列表、日历、甘特图和周期汇总。

插件 id：`z-tasking`（避免与社区里其他 tasking 插件冲突）

## 笔记结构

```text
z-tasking/
  长期/
    某长期事项.md
  临时/
    某临时任务.md
```

```markdown
---
type: long
status: doing
start: 2026-08-10
end: 2026-09-30
---

任务说明。

## 进展

### [[2026-08-13]]
今天做了什么。支持 **Markdown**、列表和 `[[双向链接]]`。
```

根目录可在设置里改，默认 `z-tasking`。

## 本地开发

```bash
npm install
npm run dev
```

把本仓库复制或 junction 到：

```text
<Vault>/.obsidian/plugins/z-tasking/
```

需要这三个文件被 Obsidian 读到：

- `manifest.json`
- `main.js`（`npm run build` 或 `npm run dev` 生成）
- `styles.css`

然后在 Obsidian：设置 → 第三方插件 → 启用 **Z-Tasking**。命令面板：`Z-Tasking: 打开任务台`。

## 界面预览

**[在线预览](https://obsidian-plugin-ztasking.vercel.app/)** · 截图来自交互原型（Mock 数据），点击可跳转体验。

| 工作台 | 列表 |
| --- | --- |
| [![工作台](docs/previews/workbench.png)](https://obsidian-plugin-ztasking.vercel.app/) | [![列表](docs/previews/list.png)](https://obsidian-plugin-ztasking.vercel.app/) |

| 日历 | 甘特图 |
| --- | --- |
| [![日历](docs/previews/calendar.png)](https://obsidian-plugin-ztasking.vercel.app/) | [![甘特图](docs/previews/gantt.png)](https://obsidian-plugin-ztasking.vercel.app/) |

[![汇总](docs/previews/report.png)](https://obsidian-plugin-ztasking.vercel.app/)


### 原型里能看什么

工作台 / 列表 / 日历 / 甘特图 / 汇总；周月季年 + 自定时间范围；说明与进展的编辑/复制；侧边栏上限与点选不插队等。数据均为虚构示例，改完刷新页面即可。

---

## 发布到社区插件

按 [官方流程](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)。

### 发新版本（GitHub Release）

1. 把 `package.json` / `manifest.json` 的 `version` 改成新版本（可用 `npm version patch` 等，会同步 `versions.json`）
2. push 到 `main` 后打 tag（**不要**加 `v` 前缀，且必须与 `manifest.json` 的 `version` 一致）：

```bash
git tag 0.2.0
git push origin 0.2.0
```

3. GitHub Action [`.github/workflows/release.yml`](.github/workflows/release.yml) 会自动：`npm ci` → `npm run build` → 校验 tag === manifest version → 创建 Release，并上传 `main.js`、`manifest.json`、`styles.css`

### 首次提交社区目录

1. 仓库保持 public，且已有与 `manifest.json` version 匹配的 GitHub Release
2. 在 [community.obsidian.md](https://community.obsidian.md) 登录，绑定 GitHub，**Plugins → New plugin** 提交本仓库
3. 按自动审阅反馈修改；通过后约 24 小时内可在 Obsidian 社区插件里搜到

后续版本只需打 tag 发 Release，无需再向 `obsidianmd/obsidian-releases` 提 PR。

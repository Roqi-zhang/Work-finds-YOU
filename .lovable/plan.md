# Work Find You 浏览器扩展（Save to Job Tracker）技术方案

## 目标
在任意招聘网站一键保存职位到 Work Find You，进入「投递管理」(Job Tracker) 统一分类跟踪，并可直接发起 JD 分析 → 简历匹配。现有页面、交互与样式**不做任何改动**，只新增扩展与一条数据接入通道。

## 用户流程
```text
浏览职位页 → 点扩展图标 → 弹窗预填（公司/岗位/地点/薪资/链接/JD 全文）
→ 可改字段、选状态(待投/已投/面试中/结束)、写备注 → 保存
→ 打开 workfindyou.cn/delivery，该职位出现在列表中（标记来源"扩展"）
→ 可选：弹窗内「保存并分析」→ 直接跳转工作台做 JD 画像与匹配
```

## 组成部分

### 1. Chrome 扩展（Manifest V3，放在项目 `extension/` 目录）
- **弹窗 popup**：沿用 Swiss × 手绘风（Patrick Hand、黑白灰、0.5px 细线），字段表单 + 保存 / 保存并分析 两个按钮 + 登录状态。
- **内容脚本 content script**：在当前页抓取职位信息：
  - 优先读页面结构化数据 `JobPosting`（JSON-LD，LinkedIn/Indeed/Boss 等多数支持）；
  - 其次按站点适配器（LinkedIn、Indeed、Glassdoor、Boss 直聘、拉勾、猎聘、智联、jobs.ch）用选择器取值；
  - 兜底：取页面标题 + 用户选中文字/正文主体作为 JD，用户手动补全。
- **登录**：扩展弹窗内用邮箱登录 Work Find You 账号（与网站同一账号体系），令牌存 `chrome.storage.local`。未登录时提示「登录后保存」。
- **打包下载**：生成 `public/work-find-you-extension.zip`，附安装说明（解压 → chrome://extensions → 开发者模式 → 加载已解压）。正式上架 Chrome 商店为后续可选步骤。

### 2. 后端（新增，不改动现有表）
- 新表 **saved_jobs**（扩展收件箱）：user_id、company、title、location、salary、url、jd_text、source_site、status、note、created_at、imported_at。仅本人可读写。
- 新云函数 **save-job**：校验登录身份与字段（长度、URL 格式）、按 user+url 去重后写入。
- 「保存并分析」复用现有 `parse-jd`（文本 JD），不新增分析逻辑；额度规则沿用每日 20 次。

### 3. 网站侧最小接入（不改界面）
- 投递管理目前数据在浏览器本地。在数据层 `wfy.ts` 增加一个"导入收件箱"函数：登录用户打开投递页/工作台时，拉取未导入的 saved_jobs，按现有 `createApplication` 写入本地列表，并回写 imported_at。界面与交互保持原样，新职位直接出现在列表里。
- 「保存并分析」跳转 `/workbench?job=<id>`，复用现有 JD 分析入口。

## 不在本次范围
- 不改任何现有页面布局、文案、样式、跳转。
- 不做 Firefox/Safari 版本、不上架商店、不做自动批量抓取（仅用户主动保存，规避站点条款风险）。

## 技术细节
- 权限：`activeTab`、`scripting`、`storage`；host 权限仅限 Work Find You 后端域，抓取用 activeTab 注入，避免申请「所有网站」权限。
- 扩展调用后端用公开 anon key + 用户 JWT；save-job 内用 JWT 校验，返回明确错误（未登录/重复/字段无效）。
- 去重：同一用户相同规范化 URL（去掉 utm 等参数）只保留一条，再次保存则更新字段。
- 测试：save-job 的校验与去重写 Deno 测试；适配器抽取逻辑对几份保存的样例 HTML 做单元测试；Playwright 验证导入后投递页出现新职位。
- 记录到 AGENTS.md：扩展通过云端收件箱同步，网站本地列表启动时导入。

## 待你确认
1. 首批重点适配哪些招聘网站（默认上面 8 个）？
2. 是否需要上架 Chrome 网上应用店（需要开发者账号 $5），还是先用压缩包手动安装？

# 模型效果 + 产品功能 · 七项改造计划

## 一、岗位画像只保留 evidence + analysis

先回答字段现状（已核对代码）：

| 字段 | 现在承载什么 | 在哪展示 | 处置 |
| --- | --- | --- | --- |
| `evidence` | JD 原文里体现这项要求的依据 | 花瓣 tooltip `Evidence` 行、维度列表 `Evidence` 行 | 保留 |
| `why` | 模型「为什么把这维判成这个等级」的判定理由 | tooltip `Why` 行、列表 `Why` 行 | 并入 `analysis` |
| `action` | 「候选人应准备什么」 | tooltip `Action` 行、列表 `Action` 行 | 删除（此阶段不该给行动建议） |
| `note` | 6 字短标签 | **岗位画像页完全没有渲染**，只是被透传 | 删除 |

改法（最小改动）：
- Schema `ideal_dimensions`：字段收敛为 `key / requiredLevel / importance / hard / evidence / analysis / signalIds`，去掉 `why`、`action`、`note`。
- Prompt：`analysis` 定义为对这项要求的专业解读 —— 这个岗位为什么需要它、达到什么程度算合格、JD 里的强度信号说明什么；明确禁止写成「候选人应该怎么做」。
- 岗位画像页：tooltip 与维度列表从三行 `Evidence / Why / Action` 改为两行 `Evidence / Analysis`。
- 兼容：读取时 `analysis ?? why`，老数据不空白；不做数据迁移。
- 候选人画像与匹配报告的 `why / note / action / developmentAction` 全部不动（那里确实在用）。


## 二、简历 / JD 全量入库 + 去重复用

现状：已有内容哈希缓存，但**作用域是单用户**（JD 按 `content_hash + user_id`，简历按 `extraction_fingerprint + user_id`），且缓存挂在业务表上，重传同一文件才命中。

新增两张表，把「文档」和「分析结果」从业务表里解耦：

```text
documents            content_hash(唯一) · kind(resume|jd) · text_len · storage_path · first_seen_at · seen_count
document_analyses    content_hash + kind + stage(extract|profile) + prompt_version + schema_version + model  (唯一)
                     → payload jsonb（evidence_items / records / signals 等原始分析产物）
```

复用规则（重要，按隐私分级）：
- **JD**：公开文本，`document_analyses` 跨用户复用。第二个用户上传同一份 JD → 0 次模型调用。
- **简历**：属于个人隐私，**只在同一 user_id 内复用**（表里加 owner_id 限定），不跨账号。
- `run-match` 的报告缓存维持现状（按 profile × job）。

收益评估：
- 省钱：命中即省整段调用。JD 侧跨用户命中率最高（同一家公司的热门 JD 会被反复上传），预计整体模型消耗下降 30–50%；同一用户反复调整流程时接近 0 成本。
- 体验：命中时从 10–30 秒降到 1 秒内返回。
- 代价：多两张表 + 一次哈希查询，可忽略。

## 三、一键下载分析结果（PDF / 图片 / Word）

- 位置：岗位画像页、候选人画像页、匹配页右上角，即现在显示 `STATE / SUCCESS · 1 LOW-CONFIDENCE` 的位置。**删除该行文字**，替换为一个 `下载 ↓` 文本按钮（Swiss 风格：全大写小字 + 0.5px 边框），点击展开三项：PDF / 图片 PNG / Word。
- 实现：`html2canvas` 截取分析区域 → PNG；PNG 置入 `jsPDF` → PDF；`docx` 库按结构化字段（不是截图）生成 Word，保证可编辑可复制。
- 抽成一个共用组件 `ExportMenu`，三页复用，导出前临时切浅色主题，避免暗色底出图发黑。

## 四、投递页可查看两份画像

投递卡片的操作区在「查看匹配」旁增加「岗位画像」「我的画像」两个入口，跳转 `/jobprofile?job=<id>&view=1` 与 `/profile?job=<id>&view=1`：只读模式，直接渲染该投递关联的历史画像（不触发重新分析、不显示上传区）。

## 五、返回不再弹「清空」确认

- 岗位画像页返回按钮：去掉 `Discard job profile?` 弹窗，直接返回，JD 与岗位能力花保留。
- 候选人画像页返回同理。
- 「重新建立画像」按钮的确认弹窗保留（那里确实会清空）。

## 六、进入匹配时不显示旧报告

现状：Profile 页点「进入匹配」后固定播 1.9 秒动效就跳转；Match 页先渲染 localStorage 里的旧报告，再异步换成新报告 —— 所以会看到旧画像。

改法：
- Profile：点击后启动双花合并动效并**循环播放**，同时直接调用 `runMatch(jobId, force)`；请求返回后才跳转 `/match`，动效时长由请求决定，不再用定时器。
- Match：若本地报告对应的 profile 版本与当前不一致，或带 `?fresh=1`，则不渲染本地快照，直接进入 `正在分析` 态。
- 请求失败：动效停止并在原页提示错误，不跳转。

## 七、匹配页「资料来源与分析思路」接真实数据

现状（已确认）：`reportFromBackend` 里 `sources` 有真实值才用，`pipeline` 和 `trace` 落回模板 mock，底部还写死了一句「接入模型后此处直接渲染真实 reasoning trace」。

改法：
- 后端 `run-match` 返回时补上真实 `pipeline`：JD 解析 / 简历抽取 / 维度判定 / 加权算分 / 生成策略，每步带命中缓存与否、条目数、耗时。
- `trace` 改为渲染真实 `decision_factors` + `rationale_summary`（已入库），映射为 factor → 依据 → 影响三列。
- 分项评分条已经是真实 `dimension_scores`，保留。
- 删除 mock 兜底与那句占位文案；没有数据时显示「本次分析未记录该环节」。

## 技术说明

- 改动文件：`_shared/schemas.ts`、`parse-jd`、`parse-resume`、`run-match`、`src/lib/wfy.ts`、`src/pages/{JobProfile,Profile,Match,Delivery}.tsx`、新增 `src/components/swiss/ExportMenu.tsx`。
- 新增依赖：`html2canvas`、`jspdf`、`docx`。
- 数据库：新增 `documents`、`document_analyses` 两表（含 GRANT 与 RLS，简历分析仅本人可读）。
- 页面布局、动效、配色一律不动，只做上述功能改动。

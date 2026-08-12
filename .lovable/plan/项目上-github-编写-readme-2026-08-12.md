# 项目上 GitHub + 编写 README

## 一、先说清楚 GitHub 部分

Lovable 与 GitHub 是**双向同步**，不是我在后台 push 代码。需要你在编辑器里操作一次：
聊天输入框左下角 **+ → GitHub → Connect project** → 授权 → 选择账号/组织 → **Create Repository**（若已有仓库则选择连接）。

之后仓库会自动持续同步，你在 Lovable 的每次改动都会推到 GitHub。
我这边能做的是：把仓库里要给别人看的文档写好（README、架构图、.env.example），你连接后自动带过去。

目标仓库（公开）：<https://github.com/Roqi-zhang/Work-finds-YOU>


## 二、现有项目架构（已核对代码）

```text
前端  React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui
      src/pages/      Home 首页 · Workbench 双画像工作台 · Match 匹配报告
                      Compare 岗位比较池 · Delivery 投递看板 · Snapshot 分析快照
                      Auth 登录 · NotFound
      src/lib/        ai.ts 云函数调用层 · wfy.ts 数据视图模型 · tasks.ts 跨页任务
                      filestore.ts 文档去重缓存 · guest.ts 访客身份
      src/components/swiss/  TopBar 顶部导航与额度 · ExportMenu 打印式 PDF 导出
      src/styles/     swiss.css 设计系统 · print.css 打印版式 · pages/*.css

后端  Lovable Cloud（Postgres + Auth + Storage + Edge Functions）
      parse-jd       JD/图片 → 岗位画像（含 OCR、评价标准 rubric）
      parse-resume   简历 → 个人能力画像（证据可追溯）
      run-match      双画像比对 → 匹配报告与投前建议
      claim-guest    访客数据在登录后归属认领
      _shared/       ai 网关 · scoring 算分 · quota 额度 · docstore 文档去重
                     schemas 结构定义 · adapter 输出适配 · hash 指纹

数据  job_profiles / user_profiles / match_reports / 投递与比较池 / usage_counters
      全部按 auth.uid() 做行级隔离
```

## 三、README 打算怎么写

面向两类读者：想用产品的人、想看技术的人。结构如下：

1. **标题与一句话定位** — 工作找你 / Job Seek You，AI 求职决策工作台
2. **它解决什么问题** — 投递机会有限，帮你判断该不该投、怎么改
3. **核心功能**（配简短说明）
   - 岗位画像：把 JD 翻译成能力地图
   - 个人画像：把简历翻译成可追溯的能力证据
   - 匹配报告：分数 + 优势/缺口/风险 + 投前 3 步（可复制文案、STAR 面试准备）
   - 比较池：多岗位横向权衡
   - 投递看板：状态流转与分析快照回看
   - 一键导出 PDF / DOCX
4. **最快使用路径** — 粘贴 JD → 上传简历 → 生成匹配 → 加入比较池 → 记录投递
5. **技术架构** — 直接放你提供的《EVIDENCE-FIRST DUAL PROFILE ARCHITECTURE (JD FIRST)》架构图（存到 `docs/architecture.png`，README 中以图片引用），下面配一段前端 / 后端 / AI 三块的文字说明
6. **AI 分析管线简述** — 证据层 → 记录层 → 信号层 → 画像层，后端确定性算分（说明为什么结果可复现）
7. **模型选型**（新增独立章节，见下方第五节）
8. **成本控制机制**（新增，见第六节）
9. **本地开发** — clone / npm i / npm run dev / npm run test
10. **商业模式与试用机制**（见第七节）
11. **在线地址与源码** — <https://workfindsyou.cn> · <https://github.com/Roqi-zhang/Work-finds-YOU>
12. **License / 说明** — 写「保留所有权利，仅供演示与作品集展示」

10. **License / 说明** — 写「保留所有权利，仅供演示与作品集展示」

同时会补一个 `.env.example`（只列变量名，不含真实值）说明需要哪些环境变量，以及 `docs/architecture.png` 架构图文件。

## 四、双语与公开仓库处理

- **中英双语**：`README.md` 采用中英对照写法（每节标题 `中文 / English`，正文中文在上、英文在下），顶部保留 `English | 中文` 锚点跳转；不再单独拆分 `README.en.md`，避免两份文档不同步。
- **公开仓库**：README 落地前我会全量检索代码，确认没有硬编码密钥（Supabase 只有 publishable key，属可公开；`.env` 不进仓库，用 `.env.example` 替代），并确认 Edge Function 里的服务端密钥全部走环境变量。


## 五、README 的「模型选型」章节写什么

选型优先级按你定的三条写死在文档开头：**① 业务准确率 → ② 模型能力形态是否吻合架构 → ③ 成本与产能**。

### 两个核心场景的能力画像

| 场景 | 关键能力 | 不重要的能力 |
|---|---|---|
| A 文件解析与分析（parse-jd / parse-resume） | 多模态读版式（PDF/截图）、原文忠实不改写、长 Schema 稳定结构化输出、抽取召回率 | 深度推理、创意 |
| B 双画像比对与分析（run-match） | 复杂语义推理、细粒度证据判断（met / proven_gap / evidence_gap / transfer_gap）、长上下文（双画像 + 证据全量入 prompt）、稳定 JSON | 多模态、极致速度 |

### 候选模型对比表（README 中以表格呈现）

维度打分 A–D，按本产品任务而非通用榜单评价。

| 模型 | 多模态读文件 | 原文忠实/抽取 | 结构化输出稳定性 | 复杂推理 | 长上下文 | 单位成本 | 更适合 |
|---|---|---|---|---|---|---|---|
| Qwen3.7-Plus | A（原生 VL 强，中文简历版式友好） | A | A | B | B+ | 低 | **A 解析层首选** |
| DeepSeek V4-Pro | 无/弱 | A | A | A | A | 中低 | **B 匹配层首选** |
| GPT-5.6 系列 | A | A | A（strict schema 最稳） | A | A | 高 | 两层都能兜底，成本敏感时不作主力 |
| Gemini 3.6 Flash | A（图片 OCR 极快，实测约 2s） | B+ | A | B | A | 极低 | **OCR 前置步骤专用** |
| Doubao / 豆包视觉版 | A | B+ | B | B | B | 极低 | 高并发降级备选 |
| Kimi 长文本系 | B | A | B+ | B+ | A | 低 | 超长 JD/简历兜底 |
| Claude 系 | A | A | A | A | A | 高 | 质量对照基线，不作主力 |

### 结论与「为什么不能只看结论」

- **A 解析层：Qwen3.7-Plus**；OCR 前置用 Gemini 3.6 Flash；GPT-5.6 作兜底。
- **B 匹配层：DeepSeek V4-Pro**；GPT-5.6 作兜底。
- 明确写清：以上是基于公开能力评价的**初步选型**，不等于本产品的最优解。README 会给出评测方法：用同一批真实 JD/简历样本，评 4 个指标 —— 证据原文可检索率、8 维等级人工一致率、同输入重复跑分数方差、单次成本与 P95 延迟，按结果再定版。
- 工程上模型是配置项（`CUSTOM_AI_MODEL` 环境变量 + 各阶段独立指定），换模型不改代码；主模型失败自动切备用。

## 六、README 的「成本控制机制」章节写什么

按代码里已经实现的四层缓存写，配一句「同一份简历换一个 JD 只重跑一半」：

1. **文档级去重**：上传即算 SHA-256（`documents` 表 + `seen_count`），同一份文件全局只登记一次。
2. **分析级缓存**：`document_analyses` 按 `内容哈希 + 阶段 + prompt 版本 + schema 版本 + 作用域` 命中即复用；JD 分析全局共享，简历分析仅限本人可见。
3. **分层指纹**：`extraction_fingerprint`（与 JD 无关）与 `profiling_fingerprint`（含 rubric_hash）分离 —— 换 JD 时只重跑画像层，抽取层直接复用，成本约减半。
4. **报告级复用**：同一「岗位画像 + 个人画像」的匹配报告唯一，重复查看不再调用模型也不扣次；只有画像换版才标记失效。

同时说明确定性算分：模型只出证据与等级，分数由后端固定公式合成，因此重复跑结果一致，也不需要为「稳定性」额外多跑几次。

## 七、README 的「商业模式与试用机制」章节写什么

- **当前阶段：前期测试期，全面免费开放试用。** 访客不登录即可完整跑通一次（岗位分析 + 简历分析 + 匹配报告），并可使用比较池与投递管理；需要第二次时登录，登录后每日 20 次分析额度（岗位/简历/匹配合计）。开发者账号不限次。
- **后期商业模式（按既定规划）**：免费档保留基础额度；付费档按会员制提供更高额度、批量岗位对比与历史报告长期留存；收款计划接入国内聚合支付（微信 / 支付宝商户），资金直达运营主体账户。README 中明确标注「付费档尚未开放，页面仅作占位」。

# Evidence-First Dual Profile Architecture · 证据优先的双画像分析架构

## 我的理解

现在后端是「模型看完简历，直接写出 8 张卡」，证据是模型概括的句子，无法回溯到具体经历与原文。这次重构不动前端三段式（CAN DO / CAN DELIVER / LONG-TERM FIT + 8 维卡片），只把它降级为 Presentation Layer，后台换成一套有先后依赖的双四层管线：

**JD 先跑，确定这个岗位在找谁（以及用哪把尺子）；简历后跑，用同一把尺子判断这份简历证明了什么；两边独立成画像，最后才比较。**

关键约束：Role Competency Pack 只作用于第 3、4 层，Layer 1–2 绝不受 JD 影响，避免带着答案去简历里找证据（确认偏差）。

## 一、总体流程

```text
STEP 1 · TARGET JD
JD → ① Document Evidence → ② Requirement Records
     → 【Role Routing】识别岗位族 + 职级 → 载入 Role Competency Pack
     → ③ Requirement Signals → ④ Ideal Candidate Profile

STEP 2 · YOUR RESUME（使用同一 Pack）
Resume → ① Document Evidence → ② Experience Records
       → ③ Capability Signals → ④ Candidate Profile

STEP 3 · FIT ANALYSIS
Ideal Profile  VS  Candidate Profile
       → Gap Analysis → 后端固定评分 → Presentation Adapter → UI
```

四层统一抽象（左右两边只有第 2、3 层对象名不同）：

| 层 | JD | Resume | 回答什么 |
| --- | --- | --- | --- |
| ① Evidence | Document Evidence | Document Evidence | 原文写了什么 |
| ② Context | Requirement Records | Experience Records | 属于怎样的完整上下文 |
| ③ Signal | Requirement Signals | Capability Signals | 对 8 维意味着什么 |
| ④ Profile | Ideal Candidate Profile | Candidate Profile | 聚合成怎样的画像 |

Role Routing 不是第五层，Gap Analysis 也不是第五层——前者是「选尺子」，后者是独立的业务阶段。

## 二、Role Competency System（新增）

新建 `supabase/functions/_shared/rolepack.ts`：

- `packs`：按 `role_family × seniority` 定义（如 `ai_pm_cn_v1` = AI 产品经理 / intern_junior），每个 pack 给出 8 维在该岗位族下的子维度与 strong / medium / weak 的行为锚点。
- 首批内置：AI 产品经理、产品经理、交互设计师、通用兜底（`generic_v1`）。
- Routing 结果形如 `{ role_family, seniority, competency_pack_id }`，随 JD 落库，简历侧读取同一个 id。
- Pack 是代码常量 + 版本号，不入库，改版即换 id，旧画像仍能标注自己用的是哪一版。

## 三、JD 解析（parse-jd）改造

两次模型调用：

**调用 A（Layer 1+2 + Routing）**
输出 `document_evidence[]`（evidence_id / section / raw_quote / page / confidence，只引用不解释）、`requirement_records[]`（requirement_id / section / text / type: responsibility|qualification|preferred / evidence_ids[]）、以及 `role_routing`。此调用不提 8 维。

**调用 B（Layer 3+4，注入选中的 Pack）**
输出 `requirement_signals[]`（dimension / subdimension / requirement_ids[] / required_level / importance: core|normal|nice / hard）与 `ideal_profile.dimensions[8]`（required_level / importance / hard / 支撑 requirement_ids / 一句话要求摘要）。

JD 页保持同样的三段式卡片，卡片底层字段换成 required_level + importance + hard，并新增「支撑要求 ↓」折叠列出原文条目。

## 四、简历解析（parse-resume）改造

同样两次调用：

**调用 A（Layer 1+2）**：`document_evidence[]` + `experiences[]`（experience_id / org / project / period / 背景 / 问题 / 行动[] / 结果[] / ownership / evidence_ids[]）。这一层完全不知道 JD，也不判断档位。

**调用 B（Layer 3+4，注入 Pack）**：
- `capability_signals[]`：dimension / subdimension / experience_id / evidence_ids[] / 行为描述 / strength
- `dimensions[8]`：level + `evidence_groups[]`（experience_id、标题、一句话贡献、结果、PRIMARY / SUPPORTING）+ evidence_summary / why / action

判断基准是「作为该岗位族该职级，这份简历证明了什么水平」，**不针对具体某条 JD 要求扣分**——那属于 Gap Analysis。分数继续由 `_shared/scoring.ts` 固定公式算，模型不给分。

无 JD 时（用户先传简历）用 `generic_v1` 跑，并在画像上记录 `competency_pack_id`；之后跑匹配若 pack 不同，提示「按目标岗位重算画像」并允许一键重跑第 3、4 层（Layer 1–2 结果复用，不重复烧 token）。

## 五、卡片三字段的新语义

| 字段 | 新语义 |
| --- | --- |
| EVIDENCE | 多个 evidence_groups 自动汇总的一句摘要（如「字节 AI 工作流等 3 段项目」） |
| WHY | 为什么达到这一档，必须对应 Role Pack 的行为锚点措辞 |
| ACTION | 证据表达补强建议（补数据 / 贡献边界 / 规模），**不写能力提升建议** |

能力提升建议只出现在 Match 页的 Gap 分析中。

## 六、Gap Analysis（run-match 改造）

不再重新读简历原文。输入：Candidate Profile + Ideal Candidate Profile + 双方 evidence / requirements + 共享 Pack。逐维输出 gap 类型：

- `met` 已满足
- `proven_gap` 确定存在能力差距
- `evidence_gap` 可能具备但简历没证明
- `transfer_gap` 能力有但场景迁移未证明
- `uncertain` 双方证据都不足

对外契约保持不变（decision / judgements[3] / steps[3] / dimension_scores[8] / sources / trace），每条判断额外带 `gap_type` 与来源 experience_id / requirement_id。评分公式不变，`SCORING_VERSION` 升到 `score-v2`，旧报告自动 stale。

## 七、前端改动（视觉与交互框架不变）

1. 画像页 / JD 页每张卡片下方新增「支撑证据 ↓」折叠，沿用 Match 页现有 0.5px 细线 + 箭头旋转样式；展开列出 01/02/03 经历（PRIMARY 标记、一句话贡献、结果），每条可再展开「查看原文证据 →」显示 raw_quote。
2. 默认收起时页面与现在完全一致。
3. Match 页每条判断加文字标记 `[真缺口]` / `[证据不足]` / `[可迁移]`，沿用文字状态标记语言，不加色块。
4. 三个结果页职责固定：JD 页答「岗位要什么人」，画像页答「这份简历证明了怎样的你」，Match 页答「差在哪、该补能力还是改简历」。

## 八、数据与迁移

- `job_profiles` 新增 jsonb 列：`document_evidence`、`requirement_records`、`requirement_signals`、`ideal_profile`，以及 text 列 `role_family`、`seniority`、`competency_pack_id`。
- `user_profiles` 新增 jsonb 列：`document_evidence`、`experiences`、`capability_signals`，text 列 `competency_pack_id`；`dimensions` 内每项新增 `evidence_groups`。
- `match_reports` 结构不变，`judgements` / `dimension_scores` 内新增 `gap_type` 与来源 id。
- 兼容：前端读不到 `evidence_groups` 时不渲染折叠触发器，老画像照常显示。

## 九、成本与稳定性

- 简历与 JD 各由 1 次调用变 2 次；抽取层只回引用、低推理档，增量主要在输出侧。
- 匹配层不再重传原文，输入显著变小，抵消一部分增量。
- 分层落库：调用 A 成功即写入，调用 B 失败只需重跑聚合，不重跑抽取。
- 换 Pack 重算画像同样只重跑第 3、4 层。

## 实施顺序

1. `rolepack.ts` + `SCORING_VERSION` 升级
2. 数据库迁移（新增列）
3. parse-jd 两段化 + Role Routing
4. parse-resume 两段化（复用 Pack，支持仅重跑 3/4 层）
5. run-match 改为双画像 Gap Analysis
6. 前端 Presentation Adapter + 证据折叠层 + gap 标记

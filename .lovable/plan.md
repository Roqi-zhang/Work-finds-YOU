# 解析架构重构：从「模型直接写 8 张卡」到「四层证据推理」

## 我的理解

现在的问题不在前端，而在后端只做了一次调用：模型看完整份简历，直接输出 8 个维度的 evidence/why/action/level。这导致证据是「模型概括出来的句子」，无法回溯到具体经历和原文，也无法解释为什么是 strong。

这次要做的是：前端三段式（CAN DO / CAN DELIVER / LONG-TERM FIT + 8 维卡片）保持不变，把它降级为 Presentation Layer；后台改成四层管线，卡片里的三个字段语义随之升级，并在卡片下方新增可展开的「支撑证据」层。

简历与 JD 采用镜像四层，中间共用同一份「岗位能力包（Role Competency Pack）」作为判定尺子。

## 目标架构

```text
            ROLE COMPETENCY PACK（岗位族 + 职级 + 8 维行为锚点）
                       │
        ┌──────────────┴──────────────┐
      RESUME                          JD
    ① Document Evidence          ① Document Evidence
    ② Experience Records         ② Requirement Records
    ③ Capability Signals         ③ Requirement Signals
    ④ Candidate Profile          ④ Ideal Candidate Profile
        └──────────────┬──────────────┘
                  Gap Analysis
                  固定评分公式（不变）
                Presentation Adapter
                    现有 UI
```

## 一、岗位能力包（新增）

新建 `supabase/functions/_shared/rolepack.ts`：按岗位族（AI 产品经理 / 产品经理 / 交互设计师 / 通用）定义 8 个维度在该族下的定义与 strong/medium/weak 行为锚点。

- 解析简历时若尚无目标岗位，用「通用」包；解析 JD 时按 JD 标题命中岗位族。
- 匹配阶段两侧必须使用同一个包，否则不可比。
- 岗位族与锚点为代码常量，便于后续扩展，不入库。

## 二、简历解析（parse-resume）改为两次调用

**调用 A · 抽取（Layer 1 + 2）**
输出 `document_evidence[]`（evidence_id / section / raw_quote / page / confidence，只忠实引用，不评判）与 `experiences[]`（experience_id / org / title / period / 背景 / 问题 / 行动[] / 结果[] / ownership / evidence_ids[]）。此调用不提任何维度概念，避免经历被提前拆散。

**调用 B · 归因与聚合（Layer 3 + 4）**
输入：experiences + evidence + 岗位能力包。输出：
- `signals[]`：capability signal，每条含 dim key、experience_id、evidence_ids[]、行为描述、strength
- `dimensions[8]`：level + `evidence_groups[]`（引用 experience_id、一句话贡献、结果、primary 标记）+ 新语义的 evidence_summary / why / action

分数仍由 `_shared/scoring.ts` 的固定公式计算，模型不给分（保持现状）。

## 三、卡片三字段的新语义

| 字段 | 新语义 |
| --- | --- |
| EVIDENCE | 由多个 evidence_groups 自动汇总的一句摘要（如「字节 AI 工作流、情绪系统等 3 段项目」） |
| WHY | 为什么达到这一档，必须引用岗位能力包的行为锚点措辞 |
| ACTION | 证据表达补强建议（补什么数据/边界/规模），**不写能力提升建议** |

能力提升建议只出现在 Match 页的 Gap 分析里。

## 四、JD 解析（parse-jd）镜像改造

同样两次调用：Layer 1 抽 `document_evidence[]`，Layer 2 抽 `requirements[]`（保留现有 text/hard/dim，新增 requirement_id、原文引用、职级信号），Layer 3/4 聚合成 `ideal_profile.dimensions[8]`：required_level / importance / hard / 支撑 requirement_ids。JD 页卡片结构与画像页一致，底层字段换成 required_level 与 importance。

## 五、匹配（run-match）改为对齐两个 Profile

不再让模型重新读简历，而是输入 Candidate Profile + Ideal Profile + 共享岗位能力包，逐维产出 gap 类型：

- `met` 已满足
- `proven_gap` 真实能力缺口
- `evidence_gap` 能力可能有，但简历证据不足
- `transferable` 可迁移

现有 decision / judgements[3] / steps[3] / dimension_scores / trace 的输出契约保持不变，只是每条判断额外带上 gap_type 与来源 experience_id，便于展开证据。评分公式不改。

## 六、前端改动（视觉与交互框架不变）

1. 画像页 / JD 页每张卡片下方新增一行「支撑证据 ↓」折叠触发器，沿用 Match 页已有的 0.5px 细线 + 箭头旋转样式；展开后按 evidence_groups 列出 01/02/03 经历（标题、PRIMARY 标记、一句话贡献、结果），每条再带「查看原文证据 →」展开 raw_quote。
2. 默认收起时页面与现在完全一致。
3. Match 页在每条判断上显示 gap 类型的文字标记（如 `[真缺口]` / `[证据不足]`），沿用现有文字状态标记语言，不加色块。

## 七、数据与迁移

`user_profiles` 新增 jsonb 列：`document_evidence`、`experiences`、`signals`（默认 `'[]'`）；`dimensions` 内每项新增 `evidence_groups`。
`job_profiles` 新增 jsonb 列：`document_evidence`、`requirement_signals`、`ideal_profile`。
`match_reports` 的 `judgements` / `dimension_scores` 内新增 `gap_type` 与来源 id 字段，无需改表结构。

旧数据兼容：前端读不到 `evidence_groups` 时不渲染折叠触发器，老画像照常显示。

## 八、成本与稳定性

- 每份简历从 1 次调用变 2 次，JD 同样 2 次。抽取层用低推理档、只回引用，token 增量主要在输出侧。
- 匹配层因为不再重传简历/JD 原文，输入反而变小，可抵消一部分增量。
- 两次调用之间失败时保留已完成层的结果并落库，前端提示「重试聚合」，不必重跑抽取。
- `scoring.ts` 的 SCORING_VERSION 升到 `score-v2`，已有报告自动标记 stale。

## 实施顺序

1. rolepack.ts + scoring 版本号
2. 数据库迁移（新增 jsonb 列）
3. parse-resume 两段化
4. parse-jd 镜像两段化
5. run-match 改为 Profile 对齐 + gap_type
6. 前端 Presentation Adapter 与证据折叠层

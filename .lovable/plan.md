# JD-First / Evidence-First 双画像架构：最小侵入升级方案

## Phase 0 审计结论（已读代码）

### 当前数据流
```text
Profile 页  → uploadFile(resume) → parse-resume ─┐
JobProfile 页 → 文本/文件 → parse-jd ────────────┤
                                                 ├→ Match 页 → run-match → match_reports
                                            user_profiles / job_profiles
```
- `parse-resume`：一次模型调用，直接产出 `dimensions[8]{key,level,evidence,why,action,note}` + `sections{experience,skills,motivation,risks}`；`computeScore` 算分；写 `user_profiles`（version 递增、is_current 唯一），并把该用户全部 `match_reports` 置 `stale=true`。
- `parse-jd`：一次模型调用，产出 `title/company/location/salary` + `dimensions[8]`（此处 level 语义是"要求强度"）+ `requirements[≤14]{text,hard,dim}`；写 `job_profiles`。
- `run-match`：读当前 `user_profiles` + 指定 `job_profiles`，一次模型调用产出 `overview/dimensions[8]/judgements[3]/steps[3]/trace[]`；后端 `computeScore` + `decisionFlag` 出分；upsert `match_reports`（含 `reasoning_trace` = JSON 字符串化的 trace）。
- 8 维与权重固定在 `_shared/scoring.ts`（skill1.4核 / business1.0 / analysis1.2核 / delivery1.4核 / comm0.9 / collab0.9 / learning0.8 / motive1.0），`strong5/medium3/weak1/missing=null`，总分 = 加权均值×100 − 缺失核心维度数×8，截断 0–99。
- 前端契约：`Profile.tsx` / `JobProfile.tsx` 消费 `{key,level,score,evidence,why,action,note}`；`Match.tsx` 经 `src/lib/wfy.ts` 适配 `decision / judgements / steps / dimension_scores / sources / reasoning_trace`。**前端已经只消费扁平 ViewModel，没有直接读内部 AI 结构**，这是本次能低成本兼容的关键。

### 与目标架构的关键差距
1. 没有 Evidence 层：`evidence` 是模型的转述，不是原文引用，不可追溯。
2. 没有 Context 层：简历被一次性拆成 8 维，同一段经历在多个维度里被重复改写，经历上下文丢失。
3. 没有 Role Competency Pack：评价尺子隐含在 prompt 文本里，不可版本化。
4. JD 侧用一个 `level` 同时表达"要求多高"和"多重要"（`requirements.hard` 是唯一的重要性信号，且与 dimension 分离）。
5. 无 Gap 类型：`missing` 既表示"没证据"也被当成"能力弱"直接扣 8 分。
6. 流程顺序是 Resume-first（Profile 页是首站），目标是 JD-first。
7. 无幂等指纹：同一份文件重复上传会重复全量分析。

## Current → Target 差异表

| 项 | 处置 | 说明 |
|---|---|---|
| `_shared/scoring.ts` DIMS / 权重 / 公式 | **Keep** | 本期完全不动（`missing` 语义问题见下方专章，单独确认） |
| `_shared/ai.ts` 网关封装 | **Keep** | 不换 provider / 模型 |
| `_shared/req.ts` 文件下载与多模态分块 | **Extend** | 只加一个 `sha256` 用于文件指纹 |
| `src/lib/wfy.ts` 适配层 | **Extend** | 已是天然 Presentation Adapter，只加 gapType 徽标等可选字段 |
| `Profile.tsx` / `JobProfile.tsx` / `Match.tsx` | **Keep** | 字段契约不变；仅 Phase 5 增加可选的"支撑经历"折叠层（不改布局） |
| `parse-jd/index.ts` | **Modify** | 拆成两次调用：Evidence+RequirementRecords+Routing / Signals+IdealProfile |
| `parse-resume/index.ts` | **Modify** | 拆成两次调用：Evidence+ExperienceRecords（Job-Agnostic） / Signals+CandidateProfile |
| `run-match/index.ts` | **Modify** | 输入换成两侧 Profile+Signals，输出增加 `dimension_matches[].gapType` |
| `job_profiles` / `user_profiles` / `match_reports` 表 | **Extend** | 只加 jsonb 列 + 少量 text 列，**不新建表** |
| `_shared/rolepack.ts` | **New** | Role Competency Pack 接口 + 1 个 production-ready 包 |
| `_shared/schemas.ts` | **New** | V2 内部类型 + JSON Schema 常量集中管理 |
| `_shared/adapter.ts` | **New** | V2 内部结构 → 现有 UI Contract |
| `reasoning_trace` | **Deprecate（软）** | 保留列，Adapter 从新的 `decision_factors` 生成兼容内容 |
| JD-First 路由调整 | **暂缓** | 见"建议暂缓"章 |

## 工程简化决策（相对你给的目标结构）

为满足"更少对象、更少表、更少调用"，同时不牺牲四层边界与可追溯性：

1. **不建新表**。三张现有表都加 jsonb 列承载 V2 中间产物，全部带 `schema_version`。理由：这些中间结构永远是"随某一次解析整体读写"的，没有独立查询需求。
2. **每条管线 2 次模型调用，不是 4 次**。Call A = Layer1+Layer2（事实层，简历侧严格 Job-Agnostic）；Call B = Layer3+Layer4（信号+画像，输入只有 Call A 的产物 + Role Pack）。四层对象仍然独立存在于返回体与数据库里，可单独断言测试。
3. **Evidence 不单独存全文快照**。`evidence_items[]` 只存 `{id, section, rawQuote, page?}`，其他层通过 `evidenceIds` 引用；避免同一段文字存三份。
4. **Requirement/Capability Signals 与 Profile 同一次调用产出**，但仍是两个独立数组字段，Profile 的每个维度通过 `signalIds` 指回信号，不重复承载文本。
5. **Role Pack 是纯代码常量**（`_shared/rolepack.ts`），不入库；库里只存 `competency_pack_id` + `competency_pack_version`，便于回放与失效判断。

## 数据库改动（Phase 2 之前一次性完成，全部为可空新增列）

`job_profiles` 增：`evidence_items jsonb`、`requirement_records jsonb`、`role_routing jsonb`、`requirement_signals jsonb`、`ideal_profile jsonb`、`competency_pack_id text`、`competency_pack_version text`、`schema_version text default 'v1'`、`content_hash text`、`prompt_version text`

`user_profiles` 增：`evidence_items jsonb`、`experience_records jsonb`、`capability_signals jsonb`、`competency_pack_id text`、`competency_pack_version text`、`schema_version text default 'v1'`、`content_hash text`、`prompt_version text`

`match_reports` 增：`dimension_matches jsonb`、`decision_factors jsonb`、`rationale_summary text`、`evidence_links jsonb`、`schema_version text default 'v1'`

风险评估：全部为 nullable 新增列，无回填、无删除、无类型变更、无关系变化；旧行 `schema_version='v1'` 继续被现有读路径正常消费。RLS/GRANT 无需变动（不新建表）。可回退：删除新增列即可。

## Role Pack MVP

只做 1 个：`ai_pm_cn / v1`（AI 产品经理，中文），因为项目现有测试样本与 8 维文案就是围绕产品岗写的。接口定义：
`{ id, version, roleFamily, seniorityScope, dimensions: { [8个key]: { definition, subdimensions[], anchors{strong,medium,weak}, validEvidence[], invalidInferences[] } } }`
Role Routing 低置信度（<0.6）时返回 `role_family="unknown" / requires_confirmation=true`，此时回落到一个 `generic_cn/v1` 通用包并在响应里标记，**不阻断流程**（保持现有 UI 不出现新的确认弹窗；确认交互列为 follow-up）。

## `missing` 语义问题（只描述，等你确认再改）

1. **当前行为**：`level="missing"` → `score=null` → 不进加权均值，且若属核心维度（skill/analysis/delivery）每个额外扣 8 分。
2. **语义问题**：`missing` 混淆了"简历没写"与"确实不具备"。新架构下这两者会被明确区分为 `evidence_gap` 与 `proven_gap`，继续沿用统一 −8 会把"没写"惩罚成"能力差"。
3. **最小修复方案**：`evidence_gap` 扣 4，`proven_gap` 扣 8，`uncertain` 不扣分只标注；`SCORING_VERSION` 升到 `score-v2`，并只对新报告生效（旧报告保留 v1 分数不重算）。
4. **本期默认不改**，Phase 4 只把 gapType 计算出来并存库，评分公式保持 v1。等你确认后作为独立小改动执行。

## Phase 执行计划（每阶段结束停下汇报）

- **Phase 1｜类型与 Role Pack（零行为变化）**：新增 `_shared/schemas.ts`、`_shared/rolepack.ts`、`_shared/adapter.ts`（先只做恒等映射）。不接线，不改现有函数。
- **Phase 2｜数据库迁移**：上面那批可空列，一次 migration。
- **Phase 3｜parse-jd 升级**：两次调用管线 + Role Routing；输出仍返回现有 `{job, salary, dimensions, requirements}`，由 Adapter 从 `ideal_profile` 生成；JobProfile 页零改动。
- **Phase 4｜parse-resume 升级**：Call A 严格 Job-Agnostic（prompt 与入参中不出现任何 JD 内容）；Call B 用 Role Pack 产 Capability Signals + Candidate Profile；`action` 内部语义收敛为 `evidenceAction`，Adapter 映射到现有 `action` 字段；Profile 页零改动。
- **Phase 5｜run-match 升级**：产出 `dimension_matches[]`（met / proven_gap / evidence_gap / transfer_gap / uncertain）、`decision_factors[]`、`rationale_summary`；评分仍走 `computeScore` v1；`reasoning_trace` 由 Adapter 从 `decision_factors` 兼容生成。
- **Phase 6｜Adapter 收口 + 前端可选增强**：`wfy.ts` 增加 gapType 文字标记（复用现有 `[W]/[I]` 式标记样式，不新增视觉语言）；Profile/Match 的证据行下增加"支撑经历"折叠（沿用现有 `.fold` 组件）。此阶段前会先给你看效果再改。
- **Phase 7｜回归与幂等**：`content_hash`（文件 sha256 或 JD 文本 hash）+ `prompt_version` + `competency_pack_version` + `schema_version` + `model` 组成 fingerprint，命中即复用已有解析结果。

## 预计修改文件

新增：`supabase/functions/_shared/rolepack.ts`、`schemas.ts`、`adapter.ts`、`hash.ts`
修改：`supabase/functions/parse-jd/index.ts`、`parse-resume/index.ts`、`run-match/index.ts`、`_shared/req.ts`（加 hash）、`src/lib/wfy.ts`（Phase 6）、`src/pages/Profile.tsx` + `Match.tsx`（Phase 6，仅折叠层）
不改：`_shared/scoring.ts`、`_shared/ai.ts`、`src/lib/ai.ts`、`JobProfile.tsx`、`Compare.tsx`、`Delivery.tsx`、路由、样式、认证。

## 前端兼容风险

- 主要风险是 Edge Function 返回体字段缺失导致页面空白。缓解：Adapter 保证 `dimensions[8]` 永远齐全（缺项补 `missing`），且 Phase 3/4 的返回体 key 与现在逐字一致。
- `Match.tsx` 通过 `wfy.ts` 解析 `reasoning_trace` 为 `[{step,detail}]`，Phase 5 必须保持这个形状，否则分析思路模块会空。

## 测试方案

1. **契约快照测试**（vitest）：对 Adapter 输入一份固定 V2 fixture，断言输出与当前线上返回体 key 完全一致。
2. **分层断言**：每条管线跑一份真实样本，断言 Layer1 `rawQuote` 能在原文中找到、Layer3 每个 signal 的 `evidenceIds` 都存在于 Layer1、同一 experienceId 可出现在多个维度且不被改写。
3. **Job-Agnostic 校验**：用两份差异极大的 JD 跑同一份简历，断言 `experience_records` 逐字相同。
4. **回归**：旧 `schema_version='v1'` 行在三个页面正常渲染；`computeScore` 单测分值不变。
5. **成本**：对比升级前后 `ai_call_logs` 的 token 与 latency，确认单次画像 ≤ 2 次调用。

## 建议暂缓（follow-up，不在本次）

- JD-First 的流程顺序调整（首页/路由/引导文案），当前 Profile 页仍是入口。
- Role Routing 低置信度的用户确认弹窗。
- `score-v2` 评分规则变更。
- motive 的 onboarding 补充来源。
- 多 Role Pack 扩展、ComparePool / DeliveryBoard、会员额度。

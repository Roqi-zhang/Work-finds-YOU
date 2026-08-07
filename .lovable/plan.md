# JD-First / Evidence-First 双画像架构：最小侵入升级方案（修订版 v2）

## Phase 0 审计结论（已读代码，未修改任何文件）

### 当前数据流
```text
Profile 页  → uploadFile(resume) → parse-resume ─┐
JobProfile 页 → 文本/文件 → parse-jd ────────────┤
                                                 ├→ Match 页 → run-match → match_reports
                                            user_profiles / job_profiles
```
- `parse-resume`：一次模型调用 → `dimensions[8]{key,level,evidence,why,action,note}` + `sections{experience,skills,motivation,risks}`；`computeScore` 算分；写 `user_profiles`（version 递增、`is_current` 唯一），并把该用户**全部** `match_reports` 置 `stale=true`。
- `parse-jd`：一次模型调用 → `title/company/location/salary` + `dimensions[8]`（level 此处表示"要求强度"）+ `requirements[≤14]{text,hard,dim}`；写 `job_profiles`。
- `run-match`：读 `user_profiles.is_current` + 指定 `job_profiles` → 一次模型调用产 `overview/dimensions[8]/judgements[3]/steps[3]/trace[]`；后端 `computeScore` + `decisionFlag`；upsert `match_reports`。
- 8 维与权重固定在 `_shared/scoring.ts`；`strong5/medium3/weak1/missing=null`；总分 = 加权均值×100 − 缺失核心维度数×8，截断 0–99。
- 前端契约：`Profile.tsx` / `JobProfile.tsx` 消费 `{key,level,score,evidence,why,action,note}`；`Match.tsx` 经 `src/lib/wfy.ts` 适配 `decision / judgements / steps / dimension_scores / sources / reasoning_trace`。**前端已只消费扁平 ViewModel**，这是本次能零 UI 改动的关键。

### 与目标架构的关键差距
1. 无 Evidence 层：`evidence` 是模型转述而非原文引用，不可追溯。
2. 无 Context 层：简历被一次性拆成 8 维，同一段经历在多维度被重复改写。
3. 无显式评价标准：尺子隐含在 prompt 文本里，不可版本化、不可复现。
4. JD 侧用一个 `level` 同时表达"要求多高"和"多重要"。
5. 无 Gap 类型：`missing` 既表示"没证据"也被当成"能力弱"扣分。
6. 流程是 Resume-first；Candidate Profile 全局单例（`is_current`），与目标 JD 无绑定。
7. 无幂等指纹：同一份文件重复上传会全量重跑。

## 本期核心产品决策（相对上一版计划的修订）

- **不引入预定义 Role Competency Pack**。用户已先上传目标 JD，因此由该 JD **动态生成本次的 Evaluation Rubric**，Requirement Signals / Ideal Profile / Capability Signals / Candidate Profile 全部以它为尺子。不做 `rolepack.ts`、不做 Role Routing、不做 generic fallback、不做 AI PM Pack。
- **架构保留未来接 Role Benchmark 的扩展位**：`evaluation_rubric` 结构里预留 `source: "jd_derived"` 与可选 `benchmark_ref`，将来接预置包时只需换 rubric 的来源，管线不动。
- **JD-First 纳入本期**：流程改为 JD → Resume → Match，只改页面顺序/跳转/上下文传参，不重做页面。
- **Candidate Profile 绑定目标 JD**：新增 `target_job_profile_id`；`run-match` 接收 `candidateProfileId + jobProfileId`。
- **严禁任何 UI 设计改动**：不加折叠、不加 gapType 标签、不改布局与样式。

## Current → Target 差异表

| 项 | 处置 | 说明 |
|---|---|---|
| `_shared/scoring.ts` DIMS / 权重 / 公式 | **Keep** | 本期完全不动（`missing` 语义见专章，单独确认） |
| `_shared/ai.ts` 网关封装 | **Keep** | 不换 provider / 模型 |
| `_shared/req.ts` | **Extend** | 只加 sha256 与"下载一次、复用 bytes"的小改造 |
| `src/lib/wfy.ts` | **Keep（字段不变）** | 已是天然 Adapter；本期不加任何新字段到 UI |
| `Profile.tsx` / `JobProfile.tsx` / `Match.tsx` 视觉与结构 | **Keep** | 只允许改：入口顺序、跳转目标、`job_profile_id` 传参 |
| `src/App.tsx` 路由表 | **Keep** | 路由 path 不变，只改导航跳转 |
| `Home.tsx` / `TopBar.tsx` 的入口指向 | **Modify（极小）** | 主 CTA 从 `/profile` 改为 `/jobprofile` |
| `parse-jd/index.ts` | **Modify** | 两次调用：Evidence+RequirementRecords / Rubric+Signals+IdealProfile |
| `parse-resume/index.ts` | **Modify** | 两次调用：Evidence+ExperienceRecords（Job-Agnostic） / Signals+CandidateProfile（吃 rubric） |
| `run-match/index.ts` | **Modify** | 入参改为 `candidateProfileId + jobProfileId`；输出增加 `dimension_matches[].gapType` |
| `user_profiles.is_current` 全局唯一 + 全量 stale | **Modify** | 改为按 `target_job_profile_id` 作用域；不再无条件 stale 所有报告 |
| 三张表 | **Extend** | 只加可空 jsonb / text 列，**不新建表** |
| `_shared/schemas.ts` | **New** | V2 内部类型 + JSON Schema 常量 |
| `_shared/adapter.ts` | **New** | V2 内部结构 → 现有 UI Contract |
| `_shared/hash.ts` | **New** | 分层 fingerprint |
| `_shared/rolepack.ts` / `competency_pack_*` / Role Routing | **Deprecate（本期不做）** | 由 JD-derived rubric 取代 |
| `reasoning_trace` | **Deprecate（软）** | 保留列，Adapter 从 `decision_factors` 生成兼容内容 |

## 工程简化决策

1. **不建新表**。三张现有表加 jsonb 列承载 V2 中间产物，全部带 `schema_version`。这些中间结构总是随一次解析整体读写，无独立查询需求。
2. **每条管线 2 次模型调用**。Call A = Layer1+Layer2（事实层）；Call B = Layer3+Layer4（信号+画像）。四层对象仍独立存在于返回体与数据库，可单独断言。
3. **Evidence 只存一次**：`evidence_items[] = {id, section?, page?, rawQuote, confidence?}`，其余层用 `evidenceIds` 引用。
4. **Signals 与 Profile 同一次调用产出**，但仍是两个独立数组；Profile 的每维通过 `signalIds` 指回信号，不重复承载文本。
5. **Rubric 是数据不是代码**：由 JD Call B 生成并存 `job_profiles.evaluation_rubric`，同时算 `rubric_hash` 供 Resume 侧引用与复现。

## Evaluation Rubric（本期形态）

由 JD 动态生成，结构（内部，不出前端）：
```text
{
  version: "rubric-v1",
  source: "jd_derived",
  benchmark_ref: null,          // 未来接预置 Role Pack 的扩展位
  roleSummary: string,          // 该 JD 的岗位画像一句话
  dimensions: {                 // 固定 8 个 key
    <dimKey>: {
      definition,               // 在本岗位语境下这一维意味着什么
      subdimensions[],          // 由 JD 内容归纳，非预置
      anchors: { strong, medium, weak },
      validEvidence[],
      invalidInferences[]
    }
  }
}
```
`rubric_hash = sha256(canonical(evaluation_rubric))`，写入 `job_profiles.rubric_hash`；Candidate Profile 存 `rubric_hash` + `rubric_version` 以保证复现。

## 数据库改动（Phase 2 一次性完成，全部为可空新增列）

`job_profiles` 增：
`evidence_items jsonb`、`requirement_records jsonb`、`requirement_signals jsonb`、`evaluation_rubric jsonb`、`rubric_hash text`、`rubric_version text`、`ideal_profile jsonb`、`content_hash text`、`prompt_version text`、`schema_version text default 'v1'`

`user_profiles` 增：
`target_job_profile_id uuid`（引用 `job_profiles.id`）、`evidence_items jsonb`、`experience_records jsonb`、`capability_signals jsonb`、`rubric_hash text`、`rubric_version text`、`extraction_fingerprint text`、`profiling_fingerprint text`、`prompt_version text`、`schema_version text default 'v1'`

`match_reports` 增：
`dimension_matches jsonb`、`decision_factors jsonb`、`rationale_summary text`、`evidence_links jsonb`、`schema_version text default 'v1'`

**风险评估**：全部 nullable 新增列，无回填、无删除、无类型变更、无 RLS/GRANT 变化（不建新表）。旧行 `schema_version='v1'` 继续被现有读路径正常消费。回退 = 删除新增列。
唯一需要留意的是 `is_current` 语义变更：改为"每个 `target_job_profile_id` 下最多一条 current"，旧行 `target_job_profile_id` 为 NULL，被视为"未绑定 JD 的历史画像"，仍可读、仍能被旧报告引用。该变更在应用层实现，不加数据库约束（避免对历史数据施加不可回退的约束）。

## JD-First 流程改造（本期，仅顺序与传参）

```text
Home ──CTA──> /jobprofile (STEP 1 上传/粘贴 JD)
                 │ 成功后跳转
                 ▼
             /profile?job=<job_profile_id>  (STEP 2 上传简历)
                 │ 成功后跳转
                 ▼
             /match?job=<job_profile_id>
```
- `/profile` 读取 `?job=`：有则传给 `parse-resume` 作为 `targetJobProfileId`；**无则维持现状**（Job-Agnostic 提取照跑，Layer3–4 用一个"通用 rubric 缺省"路径 —— 即沿用现有 prompt 行为），保证老链接与老用户不报错。
- `/match` 读取 `?job=`，找该 JD 下的 candidate profile；找不到则展示**现有的** AWAITING 空态（不新增 UI）。
- 页面内的文案、步骤条数字、布局、样式一律不动。步骤条上原有的 "01 上传简历 / 02 建立画像 / 03 进入匹配" 文案如需与新顺序对应，会先单独问你再改（属文案，不属结构）。

## Resume 侧的 Job-Agnostic 边界

- Call A（Layer1 Evidence + Layer2 Experience Records）：prompt 与入参中**不出现任何 JD 内容、不出现 rubric**。产出只依赖简历文件本身。
- Call B（Layer3 Capability Signals + Layer4 Candidate Profile）：输入 = Experience Records + Evidence Items + `evaluation_rubric`。
- Candidate Profile 只回答"在这套 rubric 下，这份简历证明了什么"，**不因 JD 的特殊硬性要求下调等级**；差距在 Gap Analysis 里表达。

## Cache / Fingerprint 分层

- `extraction_fingerprint = sha256(file_hash + extraction_prompt_version + schema_version + model)` → 命中则**复用 Evidence + Experience Records，跳过 Call A**。
- `profiling_fingerprint = sha256(extraction_fingerprint + rubric_hash + profiling_prompt_version + schema_version + model)` → 命中则复用 Candidate Profile。
- 直接效果：同一份简历换一个 JD，只重跑 Call B，成本约减半。
- JD 侧同理：`content_hash = sha256(jd文本或文件bytes)`，参与 JD 两段的 fingerprint。

## Gap Analysis（内部结构，不出 UI）

`dimension_matches[] = { dimensionKey, candidateLevel, requiredLevel, importance, hard, gapType, candidateEvidenceIds[], requirementIds[], confidence, developmentAction? }`
`gapType ∈ met | proven_gap | evidence_gap | transfer_gap | uncertain`
本期 Adapter 把这些**降维**成现有 `judgements/steps/dimension_scores` 字段，前端一个字段都不新增。

## `missing` 语义问题（只描述，等你确认再改）

1. **当前行为**：`level="missing"` → `score=null` → 不进加权均值；若属核心维度（skill/analysis/delivery）每个额外扣 8 分。
2. **语义问题**：混淆了"简历没写"与"确实不具备"。新架构会明确区分 `evidence_gap` 与 `proven_gap`，继续统一 −8 会把"没写"惩罚成"能力差"。
3. **最小修复方案**：`evidence_gap` −4、`proven_gap` −8、`uncertain` 不扣分；`SCORING_VERSION` 升 `score-v2`，只对新报告生效，旧报告不重算。
4. **本期默认不改**：Phase 5 只把 gapType 算出来存库，评分公式保持 v1。

## Phase 执行计划（每阶段结束停下汇报：修改文件 / 修改内容 / 测试结果 / 对旧逻辑·数据库·前端的影响 / 已知风险 / 下阶段）

- **Phase 1｜内部 Schema（零行为变化）**：新增 `_shared/schemas.ts`（四层类型 + Rubric + Gap 类型 + JSON Schema 常量）、`_shared/adapter.ts`（先做恒等映射）、`_shared/hash.ts`。不接线。
- **Phase 2｜数据库迁移**：上述可空列，一次 migration。
- **Phase 3｜parse-jd 升级**：Call A（Evidence + Requirement Records）→ Call B（Evaluation Rubric + Requirement Signals + Ideal Profile）；写入新列 + `rubric_hash`；对外返回体与现在**逐字一致**，由 Adapter 从 `ideal_profile` 生成 `dimensions`。JobProfile 页零改动。
- **Phase 4｜JD-First 流程接线**：Home CTA、JobProfile 成功后跳转带 `?job=`、Profile 读取并透传 `targetJobProfileId`、Match 读取 `?job=`。无 UI 结构与样式改动。
- **Phase 5｜parse-resume 升级**：Call A 严格 Job-Agnostic + extraction 缓存；Call B 吃 rubric 产 Capability Signals + Candidate Profile；写 `target_job_profile_id`；`is_current` 改为按目标 JD 作用域；stale 逻辑收敛为"只作废同一 `target_job_profile_id` 的报告"。Profile 页零改动。
- **Phase 6｜run-match 升级**：入参 `candidateProfileId + jobProfileId`（旧入参 `jobProfileId` 单独传时回落到该 JD 下的 current profile，保证兼容）；产出 `dimension_matches / decision_factors / rationale_summary / evidence_links`；评分仍走 `computeScore` v1；`reasoning_trace` 由 Adapter 从 `decision_factors` 兼容生成，形状保持 `[{step,detail}]`。
- **Phase 7｜Adapter 收口 + UI 视觉回归**：确认前端零字段变更；用 Playwright 对 `/profile`、`/jobprofile`、`/match` 在改造前后各截一组图做像素级比对，除流程顺序外必须完全一致。
- **Phase 8｜回归与成本验证**：分层缓存命中验证、历史数据兼容、`ai_call_logs` token/latency 对比。

## 预计修改文件

**新增**：`supabase/functions/_shared/schemas.ts`、`adapter.ts`、`hash.ts`
**修改**：`supabase/functions/parse-jd/index.ts`、`parse-resume/index.ts`、`run-match/index.ts`、`_shared/req.ts`（hash + bytes 复用）、`src/lib/ai.ts`（透传 `targetJobProfileId` / `candidateProfileId`）、`src/pages/Home.tsx`（CTA 目标）、`JobProfile.tsx`·`Profile.tsx`·`Match.tsx`（**仅跳转与查询参数读取，禁止触碰 JSX 结构与样式**）
**不改**：`_shared/scoring.ts`、`_shared/ai.ts`、`src/lib/wfy.ts`、`src/App.tsx`、`Compare.tsx`、`Delivery.tsx`、所有 CSS。

## 前端兼容风险

- 主要风险是 Edge Function 返回体字段缺失导致页面空白。缓解：Adapter 保证 `dimensions[8]` 永远齐全（缺项补 `missing`），Phase 3/5/6 的返回体 key 与当前逐字一致，并有契约快照测试守门。
- `Match.tsx` 依赖 `wfy.ts` 把 `reasoning_trace` 解析为 `[{step,detail}]`，Phase 6 必须保持该形状。
- 老用户手上可能有 `/profile` 直达链接（无 `?job=`）：Phase 4 已设计缺省路径，不报错。

## 测试方案

1. **契约快照**（vitest）：固定 V2 fixture → Adapter 输出与当前线上返回体 key 完全一致。
2. **分层断言**：Layer1 `rawQuote` 必须能在原文中检索到；Layer3 每个 signal 的 `evidenceIds` 均存在于 Layer1；同一 `experienceId` 可出现在多维度且文本不被改写。
3. **Job-Agnostic 校验**：两份差异极大的 JD 跑同一份简历，断言 `evidence_items` 与 `experience_records` 逐字相同、`capability_signals` 不同。
4. **缓存验证**：同简历换 JD，断言只发生 1 次模型调用（Call B）。
5. **视觉回归**：Phase 7 的截图比对。
6. **历史兼容**：`schema_version='v1'` 的旧行在三个页面正常渲染；`computeScore` 单测分值不变。

## 建议暂缓（follow-up，不在本次）

- 预置 Role Benchmark / Pack 与 Role Routing（架构已留扩展位）。
- `score-v2` 评分规则变更。
- 前端展示 Evidence Groups / gapType 标签等 UI 增强。
- motive 的 onboarding 补充来源。
- ComparePool / DeliveryBoard 与会员额度改造。

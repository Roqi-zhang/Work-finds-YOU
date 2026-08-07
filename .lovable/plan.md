# JD-First · Evidence-First 双画像架构升级方案

## 一、当前实现（审计结论）

### 数据流
```text
Profile 页    → 上传简历 → parse-resume  → user_profiles
JobProfile 页 → JD 文本/文件 → parse-jd  → job_profiles
                                   └────→ Match 页 → run-match → match_reports
```

### 三个 Edge Function 现在做了什么
- `parse-resume`：一次模型调用，直接产出 `dimensions[8]{key,level,evidence,why,action,note}` 与 `sections{experience,skills,motivation,risks}`；后端 `computeScore` 算分；写 `user_profiles`（version 递增、`is_current` 全局唯一），并把该用户**全部** `match_reports` 置 `stale=true`。
- `parse-jd`：一次模型调用，产出 `title/company/location/salary`、`dimensions[8]`（level 表示要求强度）、`requirements[≤14]{text,hard,dim}`；写 `job_profiles`。
- `run-match`：读 `user_profiles.is_current` + 指定 `job_profiles`，一次模型调用产出 `overview/dimensions[8]/judgements[3]/steps[3]/trace[]`；后端 `computeScore` + `decisionFlag` 出分；upsert `match_reports`。

### 评分与前端契约
- `_shared/scoring.ts` 固定 8 维与权重：skill 1.4(核) / business 1.0 / analysis 1.2(核) / delivery 1.4(核) / comm 0.9 / collab 0.9 / learning 0.8 / motive 1.0；`strong5 / medium3 / weak1 / missing=null`；总分 = 加权均值×100 − 缺失核心维度数×8，截断 0–99。
- `Profile.tsx` / `JobProfile.tsx` 消费 `{key,level,score,evidence,why,action,note}`；`Match.tsx` 经 `src/lib/wfy.ts` 消费 `decision / judgements / steps / dimension_scores / sources / reasoning_trace`。前端已只读扁平 ViewModel，不直接依赖 AI 内部结构 —— 这是本次可以做到零 UI 改动的前提。

### 主要缺陷
1. 无 Evidence 层，`evidence` 是模型转述而非原文，不可追溯。
2. 无 Context 层，简历一次性被拆成 8 维，同一段经历在多个维度被重复改写。
3. 评价标准隐含在 prompt 文本里，不可版本化、不可复现。
4. JD 侧用单一 `level` 同时表达"要求多高"和"多重要"。
5. `missing` 同时表示"没写"和"能力弱"。
6. 流程是 Resume-first；Candidate Profile 是全局单例，与目标 JD 无绑定，换 JD 会连带作废全部历史报告。
7. 无幂等指纹，重复上传全量重跑。

## 二、目标架构

```text
STEP 1 · JD
  Layer1 Document Evidence
  Layer2 Requirement Records
  Layer3 Evaluation Rubric + Requirement Signals
  Layer4 Ideal Candidate Profile (8 维)
        ↓ 本次岗位的评价标准确定（rubric + rubric_hash）

STEP 2 · RESUME
  Layer1 Document Evidence      ← 不接收 JD
  Layer2 Experience Records     ← 不接收 JD
  Layer3 Capability Signals     ← 接收 evaluation_rubric
  Layer4 Candidate Profile (8 维，绑定 target_job_profile_id)

STEP 3 · MATCH
  Candidate Profile vs Ideal Candidate Profile
  → Gap Analysis (met / proven_gap / evidence_gap / transfer_gap / uncertain)
  → 后端确定性评分（scoring v1，本期不变）
  → Presentation Adapter → 现有 UI 契约
```

### Evaluation Rubric
本期不引入预定义 Role Pack。用户已先上传目标 JD，因此评价标准由该 JD 动态生成，存在 `job_profiles.evaluation_rubric`：
```text
{
  version: "rubric-v1",
  source: "jd_derived",
  benchmark_ref: null,        // 未来接预置 Role Benchmark 的扩展位
  roleSummary: string,
  dimensions: {               // 固定 8 个 key
    <dimKey>: {
      definition,             // 本岗位语境下这一维意味着什么
      subdimensions[],        // 由 JD 内容归纳
      anchors: { strong, medium, weak },
      validEvidence[],
      invalidInferences[]
    }
  }
}
```
`rubric_hash = sha256(canonical(evaluation_rubric))`。Candidate Profile 保存 `rubric_hash` + `rubric_version`，保证结果可复现。将来接预置 Benchmark 时只替换 rubric 来源，管线不动。

### Job-Agnostic 边界
Resume Call A（Layer1+2）的 prompt 与入参中不出现任何 JD 内容或 rubric。Candidate Profile 只回答"在这套 rubric 下这份简历证明了什么"，不因 JD 的特殊硬性要求下调等级，差距一律在 Gap Analysis 表达。

### 调用次数
逻辑四层，实际每条管线 2 次模型调用：Call A = Layer1+Layer2（事实层），Call B = Layer3+Layer4（信号+画像）。四层对象仍各自独立存在于返回体与数据库中，可单独断言测试。

## 三、Current → Target 差异表

| 项 | 处置 | 说明 |
|---|---|---|
| `_shared/scoring.ts` 8 维 / 权重 / 公式 | Keep | 本期完全不动 |
| `_shared/ai.ts` 网关封装 | Keep | 不换 provider / 模型 |
| `src/lib/wfy.ts` | Keep | 前端字段一个不加 |
| Profile / JobProfile / Match 的 JSX 结构与样式 | Keep | 严禁改动 |
| `src/App.tsx` 路由表 | Keep | path 不变 |
| 所有 CSS、Compare、Delivery | Keep | 不动 |
| `_shared/req.ts` | Extend | 加 sha256、下载 bytes 复用 |
| `job_profiles` / `user_profiles` / `match_reports` | Extend | 只加可空列，不建新表 |
| `parse-jd/index.ts` | Modify | 拆两次调用，产 rubric / signals / ideal profile |
| `parse-resume/index.ts` | Modify | 拆两次调用，Call A 严格 Job-Agnostic |
| `run-match/index.ts` | Modify | 入参改 `candidateProfileId + jobProfileId`，产 gap 结构 |
| `user_profiles.is_current` 与全量 stale | Modify | 改为按 `target_job_profile_id` 作用域 |
| 页面进入顺序与跳转 | Modify | JD → Resume → Match，仅跳转与传参 |
| `_shared/schemas.ts` | New | 四层类型 + Rubric + Gap 类型 + JSON Schema |
| `_shared/adapter.ts` | New | 内部结构 → 现有 UI 契约 |
| `_shared/hash.ts` | New | 分层 fingerprint |
| `reasoning_trace` | Deprecate（软） | 保留列，由 `decision_factors` 经 Adapter 生成兼容内容 |
| Role Pack / Role Routing / competency_pack_* | 本期不做 | 由 JD-derived rubric 取代，留扩展位 |

## 四、数据库改动

一次 migration，全部为可空新增列，不建表、不回填、不改类型、不改关系、不涉及 RLS/GRANT。

`job_profiles` 增：`evidence_items jsonb`、`requirement_records jsonb`、`requirement_signals jsonb`、`evaluation_rubric jsonb`、`rubric_hash text`、`rubric_version text`、`ideal_profile jsonb`、`content_hash text`、`prompt_version text`、`schema_version text default 'v1'`

`user_profiles` 增：`target_job_profile_id uuid`（引用 `job_profiles.id`）、`evidence_items jsonb`、`experience_records jsonb`、`capability_signals jsonb`、`rubric_hash text`、`rubric_version text`、`extraction_fingerprint text`、`profiling_fingerprint text`、`prompt_version text`、`schema_version text default 'v1'`

`match_reports` 增：`dimension_matches jsonb`、`decision_factors jsonb`、`rationale_summary text`、`evidence_links jsonb`、`schema_version text default 'v1'`

**风险**：旧行 `schema_version='v1'`，现有读路径完全不受影响；回退等于删除新增列。`is_current` 从"全局唯一"改为"每个 `target_job_profile_id` 下唯一"，该语义在应用层实现，不加数据库约束，避免对历史数据施加不可回退的限制；旧行 `target_job_profile_id` 为 NULL，视为未绑定 JD 的历史画像，仍可读、仍能被旧报告引用。

## 五、JD-First 流程改造（仅顺序与传参）

```text
Home ──主 CTA──> /jobprofile        STEP 1 上传 / 粘贴 JD
                     │ 成功后
                     ▼
              /profile?job=<job_profile_id>   STEP 2 上传简历
                     │ 成功后
                     ▼
              /match?job=<job_profile_id>     STEP 3 匹配
```
- `/profile` 读取 `?job=`，透传 `targetJobProfileId` 给 `parse-resume`；缺省时沿用现有行为，老链接不报错。
- `/match` 读取 `?job=`，取该 JD 下的 candidate profile；找不到时展示现有 AWAITING 空态，不新增 UI。
- 页面布局、视觉、组件结构、字段排布、样式、折叠、标签一律不变。步骤条文案若需与新顺序对应，会单独提出后再改。

## 六、缓存与幂等

- `extraction_fingerprint = sha256(file_hash + extraction_prompt_version + schema_version + model)` → 命中则复用 Evidence + Experience Records，跳过 Call A。
- `profiling_fingerprint = sha256(extraction_fingerprint + rubric_hash + profiling_prompt_version + schema_version + model)` → 命中则复用 Candidate Profile。
- 效果：同一份简历换一个 JD 时只重跑 Call B，成本约减半。
- JD 侧同理，`content_hash = sha256(JD 文本或文件字节)` 参与两段 fingerprint。

## 七、Gap Analysis（内部结构，不出前端）

```text
dimension_matches[] = {
  dimensionKey, candidateLevel, requiredLevel, importance, hard,
  gapType, candidateEvidenceIds[], requirementIds[], confidence, developmentAction?
}
gapType ∈ met | proven_gap | evidence_gap | transfer_gap | uncertain
```
模型只负责分类、证据与解释；所有数值、权重、总分、扣分仍由后端计算。Adapter 把这些结构降维成现有 `judgements / steps / dimension_scores`，前端零字段新增。

## 八、`missing` 语义（本期只描述，不改）

1. 当前行为：`missing → score=null`，不进加权均值；若属核心维度每个额外扣 8 分。
2. 语义问题：混淆"简历没写"与"确实不具备"，新架构会区分 `evidence_gap` 与 `proven_gap`，继续统一 −8 会把"没写"惩罚成"能力差"。
3. 最小修复方案：`evidence_gap` −4、`proven_gap` −8、`uncertain` 不扣分，`SCORING_VERSION` 升 `score-v2`，只对新报告生效，旧报告不重算。
4. 本期默认不改，只把 gapType 算出来存库，评分公式保持 v1；评分迁移作为独立可回退的改动，等确认后单独执行。

## 九、Phase 执行计划

每个 Phase 结束即停下，汇报：修改文件 / 修改内容 / 测试结果 / 对旧逻辑·数据库·前端的影响 / 已知风险 / 下阶段计划。

- **Phase 1 · 内部 Schema**：新增 `_shared/schemas.ts`、`adapter.ts`（先恒等映射）、`hash.ts`。不接线，零行为变化。
- **Phase 2 · 数据库迁移**：第四章的可空列，一次 migration。
- **Phase 3 · parse-jd 升级**：Call A（Evidence + Requirement Records）→ Call B（Evaluation Rubric + Requirement Signals + Ideal Profile），写入新列与 `rubric_hash`；对外返回体与现在逐字一致，由 Adapter 从 `ideal_profile` 生成 `dimensions`。JobProfile 页零改动。
- **Phase 4 · JD-First 接线**：Home CTA、JobProfile 成功后跳转带 `?job=`、Profile 读取并透传、Match 读取。无结构与样式改动。
- **Phase 5 · parse-resume 升级**：Call A 严格 Job-Agnostic 并接入 extraction 缓存；Call B 吃 rubric 产 Capability Signals + Candidate Profile；写 `target_job_profile_id`；`is_current` 与 stale 收敛到同一 JD 作用域。Profile 页零改动。
- **Phase 6 · run-match 升级**：入参 `candidateProfileId + jobProfileId`（只传 `jobProfileId` 时回落到该 JD 下的 current profile）；产出 `dimension_matches / decision_factors / rationale_summary / evidence_links`；评分仍走 `computeScore` v1；`reasoning_trace` 由 Adapter 生成，保持 `[{step,detail}]` 形状。
- **Phase 7 · Adapter 收口与视觉回归**：确认前端零字段变更；用 Playwright 对 `/profile`、`/jobprofile`、`/match` 在改造前后各截一组图做比对，除流程顺序外必须完全一致。
- **Phase 8 · 回归与成本验证**：分层缓存命中率、历史数据兼容、`ai_call_logs` 的 token 与 latency 对比。

## 十、预计修改文件

**新增**：`supabase/functions/_shared/schemas.ts`、`_shared/adapter.ts`、`_shared/hash.ts`

**修改**：`supabase/functions/parse-jd/index.ts`、`parse-resume/index.ts`、`run-match/index.ts`、`_shared/req.ts`、`src/lib/ai.ts`（透传参数）、`src/pages/Home.tsx`（CTA 目标）、`JobProfile.tsx` / `Profile.tsx` / `Match.tsx`（仅跳转与查询参数读取，不触碰 JSX 与样式）

**不改**：`_shared/scoring.ts`、`_shared/ai.ts`、`src/lib/wfy.ts`、`src/App.tsx`、`Compare.tsx`、`Delivery.tsx`、全部 CSS。

## 十一、前端兼容风险

- 返回体字段缺失会导致页面空白。缓解：Adapter 保证 `dimensions[8]` 永远齐全（缺项补 `missing`），Phase 3/5/6 返回体 key 与当前逐字一致，并有契约快照测试守门。
- `Match.tsx` 依赖 `wfy.ts` 把 `reasoning_trace` 解析为 `[{step,detail}]`，Phase 6 必须保持该形状。
- 老用户可能持有无 `?job=` 的 `/profile` 链接，Phase 4 已设计缺省路径。

## 十二、测试方案

1. **契约快照**（vitest）：固定内部 fixture → Adapter 输出与当前线上返回体 key 完全一致。
2. **分层断言**：Layer1 的 `rawQuote` 必须能在原文中检索到；Layer3 每个 signal 的 `evidenceIds` 均存在于 Layer1；同一 `experienceId` 可支撑多个维度且文本不被改写。
3. **Job-Agnostic 校验**：两份差异极大的 JD 跑同一份简历，断言 `evidence_items` 与 `experience_records` 逐字相同、`capability_signals` 不同。
4. **缓存验证**：同简历换 JD，断言只发生一次模型调用。
5. **视觉回归**：Phase 7 截图比对。
6. **历史兼容**：`schema_version='v1'` 旧行在三页正常渲染；`computeScore` 单测分值不变。

## 十三、暂缓事项

预置 Role Benchmark / Pack 与 Role Routing（已留扩展位）、`score-v2` 评分变更、Evidence Groups 与 gapType 的前端展示、motive 的 onboarding 来源、ComparePool / DeliveryBoard 与会员额度改造。

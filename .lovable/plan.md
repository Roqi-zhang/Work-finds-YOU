# 四个问题的定位与修改计划

## 问题定位（已核对代码）

1. **未登录不能分析 / 登录后记录丢失 / 切页中断**
   - `supabase/functions/parse-jd/index.ts` 第 83–84 行：无 token 直接返回 401，所以访客一次也跑不了（与已定稿的「访客 1 次 JD 解析」规则不一致）。
   - `src/pages/JobProfile.tsx` 的 `saveStore` 只存了文件名和体积，没存文件本身，也没存已上传的 storage 路径；登录跳转回来后 `pickedFile` 是 null，于是提示「请重新选择 JD 文件」。
   - 分析是写在页面 `useEffect` 内部的 `async` 闭包里，组件卸载（切到别的页面）后 `await` 的结果无处可写，回来时状态被 `loadStore()` 重置成 `ready`，看起来像「进程停了」。

2. **速度慢**
   - 模型是 `openai/gpt-5.6-sol`（`supabase/functions/_shared/ai.ts`），已设 `reasoning_effort: "none"`。
   - 真正的耗时来源：岗位页 2 次串行调用、简历页 2 次串行调用、匹配 1 次，一条完整链路 5 次大模型往返，且每次都要求输出很长的严格 JSON（证据原文逐字引用 + 8 维完整锚点）。
   - 另外 `content_hash` / 指纹字段已经写库，但没有在入口处做「命中即返回」的短路，重复上传同一份 JD 仍会重跑全流程。

3. **按钮语义错**：岗位页成熟态按钮文案是「进入匹配 →」但实际跳 `/profile`；个人画像页成熟态是「下一步 →」但用户预期是「进入匹配」。

4. **证据只有摘要**：`supabase/functions/_shared/adapter.ts` 的 `summariseGroups` 把多段经历压成一句「…等 3 段经历」，完整的 `evidenceGroups`（每段的 claim / 经历名 / 原文引用）没有传给前端。

---

## 修改计划

### A. 分析任务后台化 + 记录不丢

- 新增一个全局分析任务上下文（`src/hooks/useAnalysisTasks.tsx`，挂在 `App` 顶层）：
  - 任务在 Provider 里跑，不随页面卸载而中断；切页再回来能读到「进行中 / 已完成 / 失败」。
  - 任务状态同时写入 localStorage（沿用 `wfy.ts` 的 `setUI`），刷新页面也能恢复结果。
- 上传时先把文件传进 storage，把 `filePath / fileName / jobId` 一起存进本地记录；登录回跳后直接用已存的 `filePath` 继续，不再要求重新选文件。
- 岗位页 / 画像页改为「订阅任务状态」渲染，不再用局部 `pickedFile` 判断能否继续。

### B. 访客试用 1 次

- `parse-jd` 允许无 token 调用，但按访客配额限制：新增 `guest_trials` 表（设备指纹 + IP 哈希，服务端计数，1 次上限），超出返回明确的「请登录继续」。
- 访客文件由 Edge Function 用服务角色写入 `guest/<fingerprint>/` 前缀；生成的 `job_profiles` 记录 `user_id` 为空、带 `guest_key`。
- 登录后自动认领：`Auth` 页登录成功时调用一次 `claim-guest`，把该指纹下的岗位画像归到新账号，回跳原页面时记录仍在。
- 简历上传与匹配仍需登录（与既定计费规则一致）。

### C. 提速

模型保持 `openai/gpt-5.6-sol`，从请求设计上提速：

- **并行化**：岗位侧第二次调用只依赖抽取结果，无法并行；但简历侧的「岗位无关抽取」可以在 JD 解析进行时就先跑（用户一上传简历就开跑），把 5 次串行压成 3 段。
- **缓存短路**：`parse-jd` / `parse-resume` 入口先按 `content_hash`（+ `rubric_hash`）查库，命中直接返回，重传同一份文件 0 次模型调用。
- **瘦身输出**：证据原文限制条数与单条长度、锚点描述在 prompt 里限定字数、去掉重复回传的字段，减少生成 token（生成量是主要延迟来源）。
- **预取匹配**：简历分析完成后在后台自动预跑 `run-match`，用户点「进入匹配」时通常已经算好，动画结束即出结果。
- **进度可见**：分析中显示分段进度（读取 → 抽取 → 建标准 → 评分），不再只是一个「分析中」。

### D. 按钮与跳转

- 岗位页成熟态：按钮文案改 **「下一步 →」**，跳 `/profile?job=<id>`（现有跳转已正确，只改文案）。
- 个人画像页成熟态：按钮文案改 **「进入匹配 →」**，点击后播放现有的双花合并动画，动画结束跳 `/match?job=<id>`，直接展示匹配结果（配合 C 的预取，多数情况无二次等待）。
- 步骤条序号文案同步：岗位页 `03 进入匹配` 改为 `03 下一步`，画像页保持 `03 进入匹配`。

### E. 证据可展开

- `adapter.ts` 在保留现有 `evidence` 摘要的同时，新增 `evidenceDetail` 数组（每项：经历名、结论、原文引用、primary/supporting 角色），随维度一起返回；旧字段不动，不影响现有渲染。
- 前端在每个维度的 Evidence 行下加一个「展开证据 ↓」触发（沿用 Match 页已有的 0.5px 分隔线 + 箭头旋转折叠样式），展开后逐条列出全部经历与原文，不再只显示「等 3 段经历」。

---

## 技术细节

- 新增文件：`src/hooks/useAnalysisTasks.tsx`、`supabase/functions/claim-guest/index.ts`。
- 迁移：`guest_trials` 表（含 GRANT + RLS，仅 service_role 可写）；`job_profiles` 增加可空 `guest_key` 列。
- 改动文件：`parse-jd`、`parse-resume`、`run-match`（缓存短路 + 访客分支）、`_shared/adapter.ts`（evidenceDetail）、`src/lib/ai.ts`、`src/pages/JobProfile.tsx`、`src/pages/Profile.tsx`、`src/pages/Match.tsx`、`src/pages/Auth.tsx`。
- 视觉与布局不改，新增的折叠区沿用现有 Swiss Style 组件样式。

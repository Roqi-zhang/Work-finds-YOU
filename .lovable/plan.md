# 访客免登录跑通一次 + 登录后每日 20 次限额

## 一、访客免登录完成完整一轮

目标：未登录用户可完成 1 次岗位分析 + 1 次简历分析 + 1 次匹配分析，并把结果加入比较池、投递管理；任一环节要跑第二次时才要求登录。

现状（已核实）：
- 岗位分析（parse-jd）已支持访客：`guestKey` 记账，`guest_trials.jd_parses` 限 1 次，文件走 base64 内联。
- 简历分析（parse-resume）`index.ts:72` 未登录直接 401；前端 `uploadFile` 未登录也会 401（Storage 需登录）。
- 匹配（run-match）`index.ts:55` 未登录直接 401；配额只按 `usage_counters`（user_id, period='lifetime'）。
- 比较池 / 投递管理走 localStorage（`wfy.*`），本就无需登录，不改。
- 登录后 `claim-guest` 已能把访客岗位画像认领到账号。

### 改动清单

1. 数据库迁移
   - `guest_trials` 增加 `resume_parses`、`match_runs`（int, default 0）。
   - `user_profiles.user_id`、`match_reports.user_id` 放开为可空，并各加 `guest_key text`（访客行由 service_role 写入；RLS 保持仅 `auth.uid()` 可读自己的行，访客行客户端读不到，由 Edge Function 代读）。
   - `usage_counters` 增加唯一约束 `(user_id, period)`，period 改用日期串（见第 5 条）。

2. parse-resume 支持访客
   - 无 user 时按 `guestKey` 归属：`user_profiles.user_id = null` + `guest_key`。
   - 未登录不走 Storage，前端 `src/lib/ai.ts` 的 `parseResume` 改成与 JD 一致的 base64 内联通道。
   - 超额（`resume_parses >= 1`）返回 401：「免费试用已用完 · 登录后每天可用 20 次」。

3. run-match 支持访客
   - 无 user 时按 `guest_key` 取岗位画像 / 简历画像，写入 `match_reports`（user_id 空 + guest_key）。
   - 访客配额：`guest_trials.match_runs >= 1` 即拦截。

4. claim-guest 扩展
   - 认领范围从 `job_profiles` 扩到 `user_profiles` 与 `match_reports`，登录后历史结果不丢。

5. 登录用户：每天 20 次（暂不收费）
   - 计费口径：岗位分析 + 简历分析 + 匹配分析三者合计，缓存命中不计次（沿用现规则）。
   - `_shared/quota.ts` 重写：`DAILY_LIMIT = 20`，`period` 由 `'lifetime'` 改为当天日期（UTC+8，如 `2026-08-10`），三个函数各自在成功后 +1（分别累加 `jd_parses` / `profile_builds` / `match_runs`，判定用三者之和）。
   - 开发者白名单：`shihanzhang063@gmail.com` 不限次（后端按 `user.email` 判定，常量写在 `_shared/quota.ts`；注意用户给的是 `gamil`，按正确拼写 `gmail` 处理，如确实是别的邮箱请告知）。
   - 超额返回 429：「今日 20 次分析额度已用完，明天再来」。

6. 前端
   - 去掉 `Profile.tsx:509` 与 `Workbench.tsx` `onMatch` 里的「未登录直接跳登录」，改为直接调后端；只有后端返回 401/429 时才提示并跳 `/auth?next=...`。
   - `useQuota` 改为读当天 period 的三项之和，返回 `remaining = 20 - used`；未登录时显示「试用 1 次」；开发者账号显示「无限」。
   - `TopBar` 未登录也显示额度提示。

7. 验证
   - 无痕窗口：JD → 简历 → 匹配 → 加入比较池 → 加入投递，全程不登录跑通；
   - 再跑第二次任一分析 → 出现登录提示；
   - 登录后旧数据还在（claim 生效），额度显示 剩余/20；
   - 用开发者账号连跑多次不被拦。

---

## 二、附录：后续收费时的国内支付接入（暂不实施）

暂不收费，先记录路径备用。

- Lovable 内置 Stripe / Paddle 不适用于中国大陆主体的微信 / 支付宝收款，境内收款需你自己的商户主体，钱直达对公账户。
- 前置资质（你来做）：营业执照 + 对公账户 + 域名 ICP 备案。
- 通道选择：先接聚合服务商（Ping++ / XorPay / 虎皮椒，费率约 1%–3%，接入最快）验证付费意愿，跑通后换直连微信商户号 + 支付宝开放平台（费率约 0.6%）。后端做 provider 抽象，切换只改一处。
- 后端：新增 `orders`（订单号 / user_id / 套餐 / 金额 / 状态 / provider / 交易号）与 `entitlements`（付费次数余额）；`create-order`（价格只在服务端定义）与 `payment-webhook`（验签 + 幂等 + 加余额）两个 Edge Function；配额判定顺序改为 每日免费额度 → 付费余额 → 拦截。
- 前端：定价页 + 扫码/H5 支付弹窗 + 轮询订单状态。
- 合规：服务协议、隐私政策、退款说明。

# 访客完整体验一次 + 国内聚合支付接入计划

## 一、访客免登录跑通一整条链路

目标：未登录用户可以完成 1 次岗位分析 + 1 次简历分析 + 1 次匹配分析，并把结果加入比较池、投递管理；第二次执行任一分析时才要求登录。

现状（已核实）：
- 岗位分析（parse-jd）已支持访客：用 `guestKey` 记账，`guest_trials.jd_parses` 限 1 次，文件走 base64 内联。
- 简历分析（parse-resume）第 72 行直接 `未登录 → 401`，且前端 `uploadFile` 未登录即抛 401（Storage 需登录）。
- 匹配（run-match）第 55 行直接 `未登录 → 401`，配额只走 `usage_counters`（按 user_id）。
- 比较池 / 投递管理是 localStorage（`wfy.*`），本来就不需要登录，无需改动。
- 登录后 `claim-guest` 已能把访客岗位画像认领到账号。

### 改动清单

1. 访客额度表扩展
   - `guest_trials` 增加 `resume_parses`、`match_runs` 两列（默认 0）。
   - 统一「访客各环节各 1 次」的常量放到 `_shared/quota.ts`。

2. parse-resume 支持访客
   - 允许无 user：改用 `guestKey` 归属，写入 `candidate_profiles.user_id = null` + `guest_key`。
   - 文件通道：未登录时前端不走 Storage，改成与 JD 一致的 base64 内联（`src/lib/ai.ts` 的 `parseResume` 分支）。
   - 超额（`resume_parses >= 1`）返回 401 + 文案「免费试用已用完 · 登录后继续」。

3. run-match 支持访客
   - 无 user 时按 `guest_key` 查岗位画像与简历画像、写 `match_reports`（user_id 为 null + guest_key）。
   - 配额：登录走 `usage_counters`（3 次），未登录走 `guest_trials.match_runs`（1 次），缓存命中不计费（保持现规则）。

4. claim-guest 扩展
   - 认领范围从 `job_profiles` 扩展到 `candidate_profiles` 与 `match_reports`，登录后历史结果不丢。

5. 数据库策略
   - 上述三张表的 guest 行由 service_role（Edge Function）写入，客户端不直接读写访客行，RLS 保持仅 `auth.uid()` 可读自己的行；新增列同迁移内不需要新增 GRANT（表已存在）。

6. 前端登录门槛后移
   - `Profile.tsx:509`、`Workbench.tsx` 的 `onMatch` 去掉「未登录直接跳登录」，改为调用后端；仅当后端返回 401 超额时，提示并跳 `/auth?next=...`。
   - `TopBar` 额度显示：未登录时显示「试用 1 次」，登录后显示剩余 3 次（`useQuota` 增加访客分支）。
   - 比较池 / 投递管理保持不变（本地存储即可用）。

7. 验证
   - 无痕窗口：JD → 简历 → 匹配 → 加入比较池 → 加入投递 全程无登录；
   - 再跑第二次任一分析 → 出现登录提示；
   - 登录后旧数据仍在（claim 生效），剩余额度显示 3。

---

## 二、国内聚合支付接入计划（微信 / 支付宝）

结论先行：Lovable 内置的 Stripe / Paddle 对中国大陆经营主体和境内微信、支付宝收款不适用。境内收款必须由你自己的商户主体完成，钱直达你的对公账户。

### 最科学高效的路径

阶段 0 · 资质准备（你来做，约 3–7 天）
- 营业执照 + 对公账户 + 已备案域名（`workfindsyou.cn` 需 ICP 备案，未备案则微信/支付宝商户无法通过）。
- 选一种通道：
  - 推荐 A：直连「微信支付服务商/商户号 + 支付宝开放平台当面付/电脑网站支付」，费率约 0.6%，无中间商。
  - 备选 B：聚合服务商（Ping++ / payjs / XorPay / 虎皮椒），接一次即同时拿到微信+支付宝，接入最快，费率约 1%–3%，适合先跑通。
- 建议：先用备选 B 上线验证付费意愿，跑通后再换直连 A（后端做成 provider 抽象，切换只改一处）。

阶段 1 · 后端（Edge Functions，我来做）
- 新增表 `orders`（订单号、user_id、套餐、金额、状态、provider、provider_txn_id、超时时间）与 `entitlements`（user_id、已购匹配次数余额、有效期）。
- `create-order`：登录校验 → 校验套餐价格（价格只在服务端定义，绝不信任前端）→ 调支付网关下单 → 返回二维码链接 / 跳转 URL。
- `payment-webhook`：接收异步回调 → 验签（微信 V3 平台证书 / 支付宝 RSA2 / 聚合方 MD5-Key）→ 幂等更新订单 → 增加 `entitlements` 次数 → 返回成功报文。
- `run-match` 配额判定顺序调整为：免费额度 → 付费余额 → 拦截。
- 密钥用 secrets 存储（商户号、API v3 Key、私钥），不入库不入代码。

阶段 2 · 前端（我来做）
- 定价页：套餐（例：10 次 ¥19 / 50 次 ¥69 / 不限时会员 ¥xx，具体你定）。
- 支付弹窗：PC 展示二维码（微信 Native / 支付宝扫码），移动端 H5 跳转；前端轮询订单状态，以 webhook 为准。
- 支付成功后刷新额度（复用现有 `wfy:usage` 事件）。

阶段 3 · 合规与运营
- 页面底部加《服务协议》《隐私政策》《退款说明》，商户审核会检查。
- 交易需可开票、可退款：`orders` 保留原始回调报文备查。

### 需要你提供的信息
1. 是否已有营业执照与 ICP 备案？
2. 选直连还是聚合服务商（若聚合，倾向哪家）？
3. 套餐价格与次数怎么定？

技术上我可以完成阶段 1、2 的全部代码；阶段 0 的商户资质与密钥申请必须由你完成后把凭据通过安全表单交给我。

# 埋点与数据看板方案

目标：看到总访问人数 + 每一步流失漏斗，且**实时可查**。

## 方案选择

推荐「自建轻量埋点 + 站内数据看板页」，而不是只接第三方：

- 数据存在自己的数据库里，可以按 guest_key / user_id 关联到真实的 JD 解析、简历解析、匹配记录，做到「行为 + 业务结果」同一套口径；
- 国内用户访问第三方 SDK（PostHog/GA）常被拦截或加载慢，会丢数据；
- 实时性：看板直接读数据库，刷新即最新。

（可选加料：后续若要热图、回放、留存自动分析，再叠加 PostHog，不影响本方案。）

## 一、埋点事件设计

统一事件表 `analytics_events`，每条含：事件名、会话 ID、访客 ID（复用现有 guest_key）、user_id（登录后自动带上）、页面路径、来源 referrer、UTM、设备类型、耗时/结果等属性、时间戳。

核心漏斗事件（严格对应产品主流程）：

| 序号 | 事件 | 含义 |
|---|---|---|
| 1 | `page_view` | 任意页面访问（首页即漏斗入口） |
| 2 | `workbench_enter` | 进入工作台 |
| 3 | `jd_upload_start` | 提交 JD（粘贴/上传/拖拽，属性区分方式） |
| 4 | `jd_parse_success` / `jd_parse_fail` | 岗位画像成功/失败（含耗时、错误类型） |
| 5 | `resume_upload_start` | 提交简历 |
| 6 | `resume_parse_success` / `_fail` | 个人画像成功/失败 |
| 7 | `match_start` | 点击「进入匹配」 |
| 8 | `match_success` / `match_fail` | 匹配报告生成 |
| 9 | `match_view` | 看到匹配报告页 |
| 10 | `add_to_pool` / `add_to_delivery` | 加入比较池 / 投递管理 |
| 11 | `export_pdf` | 导出报告 |
| 12 | `auth_prompt`（触发登录墙）→ `signup_success` / `signin_success` | 登录转化 |
| 13 | `quota_blocked` | 被每日额度拦截 |

辅助事件：`session_start`、`session_end`（停留时长）、`error_shown`（前端报错文案）。

## 二、能回答的问题（分析师视角）

- **总量**：日/周访问人数（去重访客）、新访客占比、会话数、平均停留时长。
- **主漏斗转化率**：首页 → 工作台 → JD 解析成功 → 简历解析成功 → 匹配成功 → 加入投递。每步展示进入数、通过数、流失数、流失率。
- **失败 vs 放弃归因**：每步流失拆成「技术失败」（parse_fail / 超时 / 额度拦截）与「主动放弃」（无后续事件），这是决定优化方向的关键区分。
- **耗时分布**：各 AI 步骤 P50/P90 耗时，定位「等太久导致流失」。
- **入口质量**：按 referrer / UTM 分渠道看漏斗，判断哪类流量真正会跑完闭环。
- **登录转化**：触发登录墙的人里有多少完成注册。
- **设备**：移动端 vs 桌面端漏斗差异（当前布局偏桌面，移动端流失大概率更高）。

## 三、数据看板

站内新增 `/insights` 页面（Swiss Style，与现有视觉一致），仅开发者账号 `shihanzhang063@gmail.com` 可见：

- 顶部：时间范围切换（今天 / 7 天 / 30 天 / 自定义）+ 核心指标卡（访客数、会话数、完成匹配数、注册数）；
- 中部：漏斗图（每步人数 + 转化率 + 流失人数，点击某步可看该步失败原因分布）；
- 下部：趋势折线（按天访客与匹配数）、渠道表、设备表、AI 步骤耗时与失败率表；
- 手动刷新 + 30 秒自动刷新，实时看数。

## 技术实现

1. **数据库**：新建 `analytics_events`（事件明细）表，字段含 `event`、`session_id`、`visitor_id`、`user_id`、`path`、`referrer`、`utm_*`、`device`、`props jsonb`、`created_at`；建索引 `(created_at)`、`(event, created_at)`、`(visitor_id)`。RLS：仅 service_role 写；读取仅开发者角色（通过独立 `user_roles` 表 + `has_role()` 判定，不把角色放 profiles）。
2. **上报通道**：新增 Edge Function `track`，匿名可调用，服务端写库（避免前端直写导致数据被篡改/RLS 复杂）；前端 `src/lib/analytics.ts` 提供 `track(event, props)`，用 `navigator.sendBeacon` 兜底，失败静默、带小批量队列，不阻塞主流程。
3. **前端接入**：路由变化自动发 `page_view`；在 `JobProfile.tsx` / `Profile.tsx` / `Workbench.tsx` / `Match.tsx` / `Compare.tsx` / `Delivery.tsx` / `Auth.tsx` / `ExportMenu.tsx` 的既有回调里插入对应事件（不改任何业务逻辑）。
4. **聚合查询**：新增 Edge Function `insights`（或数据库函数）做漏斗与趋势聚合，返回给 `/insights` 页面渲染；数据量大之后再加物化视图/按天汇总表。
5. **隐私**：不采集简历/JD 正文，只存事件名、结果状态与耗时；visitor_id 为随机 ID，不做跨站追踪。

## 交付顺序

1. 建表 + `track` 函数 + `src/lib/analytics.ts` + 全局 page_view；
2. 主流程关键事件接入；
3. `/insights` 看板页（漏斗 + 指标卡 + 趋势）；
4. 渠道 / 设备 / 耗时细分与失败归因。

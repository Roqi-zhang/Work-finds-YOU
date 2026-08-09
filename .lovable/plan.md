# 仅导出前端 + 后端本地部署方案

## 结论
可行，且是**最彻底摆脱 Lovable 依赖**的路径。前端是纯 React + Vite + TS 单页应用，后端现在全部跑在 Supabase Edge Functions 里，逻辑可以平移到任何 Node/Deno/Bun 后端。部署到中国大陆服务器即可解决国内访问与备案问题。

---

## 一、当前项目里有哪些 Lovable 依赖

| 依赖 | 位置 | 能否本地替代 | 说明 |
| --- | --- | --- | --- |
| 前端托管 | Lovable 预览/发布 | 可 | 导出后自己用 Vercel/Netlify/国内服务器/对象存储托管 |
| 后端 Auth | Lovable Cloud / Supabase Auth | 可 | 替换为自建 JWT / Logto / Casdoor / Keycloak 等 |
| 后端数据库 | Lovable Cloud / Supabase Postgres | 可 | 迁移到本地/云主机 Postgres |
| 后端存储 | Lovable Cloud / Supabase Storage | 可 | 替换为本地磁盘 / MinIO / 阿里云 OSS / S3 兼容存储 |
| 服务端函数 | Supabase Edge Functions | 可 | 平移到 Node.js / Deno / Bun 的 HTTP 服务 |
| AI 调用 | 阿里云 MaaS（已通过自定义 Key） | 可 | 当前已用自己的 API Key，无需 Lovable AI Gateway |
| 实时订阅 | 未使用 | — | 若未来使用需自建 WebSocket 或 SSE |

---

## 二、导出前需要确认/清理的前端代码

### 1. 移除 Lovable 专用集成
- `src/integrations/lovable/index.ts`：删除，或改为纯 Supabase 标准 OAuth 调用。
- `src/integrations/supabase/client.ts`：这是自动生成的 Supabase 客户端，里面的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` 要换成你本地后端的 API base URL 和公钥。

### 2. 前端环境变量
导出后需自己维护 `.env`：
- `VITE_API_BASE_URL`：你的本地后端 API 地址（如 `https://api.yourdomain.com`）。
- `VITE_PUBLIC_KEY`：后端用于鉴权的公钥或 anon key（如果后端模拟 Supabase 风格）。
- 不再使用 `VITE_SUPABASE_URL` 等 Lovable 专用变量。

### 3. 数据层改造
- `src/lib/ai.ts`：现在调用 `supabase.functions.invoke(...)`，需要改成普通 `fetch` 调用你的本地 API。
- `src/lib/wfy.ts`、`src/lib/filestore.ts`、`src/lib/guest.ts`：所有 Supabase 客户端调用（`supabase.from(...)`、`supabase.storage`）都要改成调用你的 REST API。
- 若保留 Supabase 风格的 JWT/RLS，可以最小改动；若换其他后端，需要重写数据访问层。

### 4. UI 默认品牌
- `index.html` 标题/meta、默认 Logo 等需改为 Job Seek You 自有品牌。

---

## 三、后端本地部署方案

### 推荐架构
```text
反向代理（Nginx / Caddy）
    ├── 静态前端 (dist/)
    ├── API 服务 (Node/Bun/Deno)
    │       ├── /auth/*        登录/注册/会话
    │       ├── /api/jobs      岗位解析/缓存
    │       ├── /api/resumes   简历解析/缓存
    │       ├── /api/match     匹配分析
    │       ├── /api/storage   文件上传/下载
    │       └── /api/claims    游客数据迁移
    ├── Postgres 数据库
    └── 对象存储（MinIO / OSS / S3）
```

### 后端需要复刻的模块
1. **Auth**：自建 JWT 签发/校验，邮箱密码注册，邮件确认，密码重置。可选 Logto/Casdoor 加速。
2. **数据库**：当前所有 `public` 表结构（`profiles`、`resumes`、`user_profiles`、`job_profiles`、`match_reports`、`applications`、`usage_counters`、`ai_call_logs` 等）导出为 SQL 后在新 Postgres 执行。
3. **RLS**：自建后端不再用 `auth.uid()`，要在 API 层做权限校验（根据 JWT 中的 user_id 过滤数据）。
4. **文件存储**：上传简历/JD 到本地存储或 OSS，返回可访问 URL。
5. **解析服务**：把 `supabase/functions/parse-jd/index.ts`、`parse-resume/index.ts`、`run-match/index.ts` 三个函数逻辑迁移到 API 路由。
6. **缓存/去重**：`docstore.ts` 里的文档指纹去重逻辑保留。
7. **AI 调用**：`supabase/functions/_shared/ai.ts` 可直接复用，环境变量 `CUSTOM_AI_API_KEY` / `CUSTOM_AI_BASE_URL` / `CUSTOM_AI_MODEL` 保持不变。

### 最小可运行后端（最快验证）
用 Express + PostgreSQL + MinIO 重搭：
- 3 个解析接口（JD、简历、匹配）。
- 1 个 auth 接口（JWT 登录/注册）。
- 1 个文件上传接口。
- 游客逻辑通过 localStorage `guest_key` 继续在前端生成，后端用 `guest_key` 临时关联数据，登录后迁移到 `user_id`。

---

## 四、国内访问与备案

- 只要后端部署在**中国大陆服务器**（阿里云 ECS、腾讯云、华为云等），且域名解析到该服务器，国内用户无需 VPN 即可正常访问。
- 在中国大陆向公众提供服务需要 **ICP 备案**：域名实名制、服务器在境内、主体为企业或个体工商户（个人备案有经营范围限制）。
- 备案期间网站不可对外访问，建议先用海外服务器跑通产品，再切到国内服务器并提交备案。
- 如果 AI 模型接口也在海外（阿里云 MaaS 在国内有节点，通常不需要 VPN），需确认模型服务端点的网络可达性。

---

## 五、迁移顺序建议

1. **导出前端**：在 Lovable 中把项目导出为 ZIP，保留 `src/`、`index.html`、`package.json`。
2. **清理前端**：删除 `src/integrations/lovable`，把 `supabase` 调用替换为本地 `fetch` 调用（可以保留相同接口契约）。
3. **搭建最小后端**：Express + Postgres + MinIO，先迁移 3 个解析函数 + 文件上传 + 游客数据迁移。
4. **自建 Auth**：先用 Logto/Casdoor 快速替代，避免从零写邮箱验证。
5. **数据迁移**：把当前 Lovable Cloud 数据库数据导出，导入新 Postgres。
6. **国内部署**：买国内服务器和域名，完成 ICP 备案后切换 DNS。

---

## 六、风险与成本

| 项目 | 风险/成本 |
| --- | --- |
| 前端导出 | 无风险，代码可直接运行 |
| 后端重写 | 1–2 周工作量（取决于是否用现成 Auth 方案） |
| 自建 Auth | 邮件送达、密码找回、风控需自行维护 |
| 数据库迁移 | 需导出/导入，注意 `auth.users` 表不能直接用，密码哈希需重置 |
| 国内备案 | 周期 7–20 个工作日，需准备主体资质 |
| 文件存储 | 小量可用本地磁盘，生产建议 OSS/S3 |

---

## 七、需要你决定的事

1. 后端用什么运行时：Node.js / Bun / Deno？
2. 认证方案：自建 JWT、Logto、Casdoor、Keycloak 还是 Auth0？
3. 部署位置：先海外验证，还是直接国内服务器？
4. 数据库：自己维护 Postgres，还是用阿里云 RDS / 腾讯云 PostgreSQL？
5. 文件存储：本地磁盘 / MinIO / 阿里云 OSS / AWS S3？

如果确认要走这条路，我可以先输出一份**最小后端接口契约**（与前端数据层对齐），以及**前端数据层替换清单**，作为你下一步开发或交给外包的交接文档。

# 把登录/注册换成自有服务 + 去除 Lovable 品牌 + 自定义域名 + 国内访问

## 结论前置

- **登录服务本身**能否完全换成自己的：可以，但分两层。如果只是想换掉 Google OAuth 的品牌归属，改动最小（方案 A）；如果想让邮箱注册、会话、确认邮件也完全不经过 Lovable，必须走彻底自建认证（方案 B）。
- **去除 Lovable 品牌**：前端 UI 中的 Lovable 元素可以全部删除；但方案 A 的认证底层仍在 Lovable Cloud，用户收邮件/点确认链接时仍会看到 Lovable 托管域名。彻底隐藏需要方案 B。
- **中国国内访问**：当前托管在海外，不连 VPN 大概率慢、部分网络不稳定。国内正式运营需要 ICP 备案 + 国内节点。域名可以现在就用，备案另作后续规划。
- **自定义域名**：可以，先发布到 Lovable 域名，再在 Project Settings → Domains 连接你买的域名（添加 A 记录到 Lovable IP）。

---

## 一、认证方案（二选一）

### 方案 A：只换 Google OAuth 归属，其余认证仍用 Lovable Cloud
- 你提供：Google OAuth Client ID + Secret、自己的应用名称/Logo、正式域名。
- 需要做的事：
  1. 在 Google Cloud Console 创建自己的 OAuth 应用，把 Lovable 的回调域名加入 Authorized redirect URIs。
  2. 在 Lovable Cloud Auth 设置里填入你自己的 Google Client ID / Secret，替换掉默认托管凭证。
  3. 前端删除 `src/integrations/lovable/index.ts` 相关调用，Google 按钮改为标准 `supabase.auth.signInWithOAuth`（或等效托管流程，取决于实现）。
  4. 邮箱/密码注册、会话、RLS 策略、数据库表完全不动。
- 效果：用户用 Google 登录时， consent 页面显示的是你自己的应用名称和 Logo；登录成功后回到你的域名。
- 局限：邮箱注册后的确认邮件、密码重置邮件仍由 Lovable Cloud 代发，邮件里的链接可能带 Lovable 域名；认证 API 域名仍是 Lovable Cloud 的 Supabase 子域名。用户不刻意查看网络请求时，日常 UI 不会看到 Lovable 字样。

### 方案 B：完全自建认证服务（邮箱/密码 + Google 都走自己的服务）
- 候选方案：自己写一个基于 JWT 的认证服务，或用 Auth0 / Logto / Casdoor / Keycloak 等开源方案。
- 需要做的事：
  1. 自建用户表、密码哈希、邮箱验证、密码重置、会话刷新。
  2. 替换 Supabase Auth 模块：你的新服务需要签发与 Supabase PostgREST 兼容的 JWT（配置 JWKS 或共享 JWT Secret），否则所有 `auth.uid()` 的 RLS 策略都要重写。
  3. 三个服务端函数（`parse-jd`、`parse-resume`、`run-match`）都要从校验 Supabase JWT 改成校验新服务 JWT。
  4. 游客数据认领逻辑（`claim-guest`）要改，因为 guest/user 关联从 `auth.users` 变成你自己的用户表。
  5. 现有账号迁移：密码哈希能否迁移取决于目标方案，一般只能让老用户用邮箱重置密码重新登录。
- 效果：认证流程完全独立，确认邮件、域名、品牌全部是自己的。
- 风险：邮件送达率、风控、限流、安全更新都需要自己维护；工作量约为方案 A 的 5–8 倍。

### 建议
短期先用方案 A，去掉前端可见的 Lovable 品牌即可。如果未来要国内备案/独立部署，再评估方案 B。

---

## 二、去除 Lovable 品牌

### 前端可见部分（需要改动）
- `src/pages/Home.tsx` / `src/components/swiss/TopBar.tsx`：删除或替换任何 Lovable 提供的默认 Logo/水印。
- `index.html`：`<title>`、`<meta name="description">`、og 标签改为 Job Seek You 自己的文案；不能保留 "Lovable App" 等模板默认字样。
- `public/placeholder.svg`：如果项目中使用，替换为自有占位图。
- 发布时 Lovable 的右下角/编辑器 UI 只在编辑态出现，发布后的公开站点不会带编辑器水印。

### 认证流程部分（取决于方案）
- 方案 A：确认邮件由 Lovable 代发，无法改成你的域名，但邮件内容里的应用名可以改为你的品牌（在 Cloud Auth 邮件模板里设置）。
- 方案 B：邮件你自己发，域名也是自己的。

---

## 三、中国国内访问

- **当前状态**：前端和后端都托管在海外。中国大陆用户不连 VPN 通常能打开，但速度慢、部分企业网络/地区可能无法稳定访问。
- **正式运营**：若面向中国大陆公众提供服务，需要 ICP 备案，且域名解析到境内服务器。当前 Lovable Cloud 的 Supabase 后端在海外，无法直接完成备案。
- **建议路径**：先挂自有域名在海外上线，跑通产品与付费；如果确认要主攻国内市场，再单独规划国内服务器/备案（这是独立于当前开发阶段的决策，不影响现在实现）。

---

## 四、自定义域名

### 步骤
1. 先在 Lovable 发布项目，获得 `xxx.lovable.app` 的公开地址。
2. 进入 **Project Settings → Project section → Domains**（或 Publish 弹窗里的 Add custom domain）。
3. 选择 **Connect Domain**，输入你买的域名（例如 `yourdomain.com`）。
4. Lovable 会给出 DNS 记录：
   - A 记录 `@` → `185.158.133.1`
   - A 记录 `www` → `185.158.133.1`
   - TXT 记录 `_lovable` → `lovable_verify=xxx`
5. 去你的域名注册商（如 Cloudflare / 阿里云 / 腾讯云）添加这些记录，等待 DNS 传播（通常几分钟到 72 小时）。
6. 在 Lovable 里选择主域名（建议用 `www.yourdomain.com` 作为主域名，根域 `yourdomain.com` 重定向到 www），其他会自动跳转。

### 注意
- 自定义域名完成后，Google OAuth 的回调白名单里也要加上你的域名（方案 A）。
- 中国 ICP 备案要求域名解析到境内服务器，目前海外托管不满足；若后续备案，需要把站点部署到国内节点。

---

## 五、需要你立即提供的信息（如果选方案 A）

1. Google OAuth Client ID 与 Client Secret（通过安全密钥表单提交，不要贴在聊天）。
2. 你的应用名称（显示在 Google consent 页面）。
3. 你买的域名（例如 `www.yourdomain.com`）。

如果选方案 B，请告诉我你倾向的认证方案（自建 JWT / Auth0 / Logto / Casdoor / Keycloak），我再给出迁移细节。

---

## 六、不修改代码的前提下，你可以先做的事

- 删除或替换项目中的默认 Lovable 文案/Logo（不需要我改认证，也可以先做）。
- 在 Lovable 域名设置里尝试连接你已经购买的域名（发布后才能操作）。
- 去 Google Cloud Console 创建 OAuth 应用，拿到 Client ID / Secret（这一步不依赖我改代码）。

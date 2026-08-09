# 把登录/注册换成自有服务

结论：可以。目前只有 Google 登录这一条路径借用了 Lovable 托管的 OAuth 中转，邮箱密码注册/登录本来就跑在你自己的后端（Cloud 数据库的 Auth 模块）上。要完全脱离 Lovable，需要按"自有 OAuth 应用"和"自有认证服务"两个层级来选。

## 两种方案

### 方案 A（推荐，改动小）：保留现有认证服务，只换 Google OAuth 为自有应用
- 你在 Google Cloud Console 建自己的 OAuth Client（拿 Client ID / Secret）。
- 后端 Auth 的 Google Provider 填入你自己的凭证，回调地址指向你自己的域名。
- 前端删掉 `src/integrations/lovable/index.ts` 的调用，Google 登录改为标准的 `supabase.auth.signInWithOAuth`。
- 邮箱/密码、会话、`user_id`、所有 RLS 策略完全不动，历史账号不受影响。
- 后续本地/自托管部署时，认证服务随后端一起搬走，无需再改前端。

### 方案 B（彻底自建）：换成完全自己的认证服务（自建 JWT / Auth0 / Logto / Casdoor 等）
- 需要自建用户表、密码哈希、邮件验证、找回密码、令牌签发与刷新。
- 数据库所有 RLS 依赖 `auth.uid()`，换认证后必须让新服务签发后端可校验的 JWT（配置 JWT Secret / JWKS），否则全部策略要重写。
- 三个服务端函数里的用户识别、游客认领逻辑都要改成校验新令牌。
- 现有账号需要迁移（密码哈希能否迁移取决于目标服务）。
- 工作量约为方案 A 的 5–8 倍，且要自己承担邮件送达、风控、限流。

## 建议路径
先做方案 A（1 次改动即可摆脱对 Lovable OAuth 中转的依赖），等真正要把后端搬到本地/国内节点时，再评估是否需要方案 B。

## 方案 A 的具体改动清单
1. `src/integrations/lovable/index.ts`：删除（或不再引用）。
2. `src/pages/Auth.tsx`：Google 按钮改用 `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin + next } })`。
3. 后端 Auth 配置：填入你自己的 Google Client ID / Secret，并在 Google 控制台把回调 URL 加入白名单（预览域名 + 正式域名各一条）。
4. 站点 URL 与允许的跳转地址补上你的自有域名。
5. 回归验证：邮箱注册→邮件确认→登录、Google 首登与二次登录、`?next=` 回跳、游客记录认领。

## 需要你提供
- Google OAuth Client ID 与 Client Secret（通过安全密钥表单提供，不要贴聊天里）。
- 你的正式域名（用于回调白名单）。

如果选方案 B，请另外告诉我目标认证服务（自建 / Auth0 / Logto / Casdoor），我再出迁移方案。

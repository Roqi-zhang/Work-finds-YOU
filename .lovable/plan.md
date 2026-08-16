# 本轮计划：先做拖拽上传，手机号登录交给 Codex

## 一、拖拽上传（本轮实现）

现状核查：个人画像、岗位画像两栏是全站仅有的文件上传入口，两者的整块面板已绑定拖放事件，CSS 中已有 `.layout.dragging` 高亮态。因此本轮只做补齐与验收：

1. 岗位画像栏拖拽悬停时，提示文案与个人画像统一为「松开即上传 · RELEASE TO UPLOAD」，松手或离开后恢复原文案。
2. 拖放高亮统一为整块面板 0.5px 描边变实线深色，不加阴影、不加色块。
3. 已有画像时拖入新文件，走与点击卡片重新上传完全一致的逻辑（含二次确认规则不变）。
4. 文件类型与大小校验复用现有逻辑，不新增提示样式。
5. 窗口其它区域继续阻止浏览器默认「直接打开文件」行为；工作台两栏各自只响应落在自己列内的拖放。
6. 用 PDF / 图片 / Word 各拖入一次做验证。

不改任何上传、解析、额度或后端逻辑。

## 二、手机号登录 · 给 Codex 的执行指令（本轮不写代码）

下面整段可直接复制给 Codex。执行前需在后端密钥中准备 4 个值：`ALI_SMS_ACCESS_KEY_ID`、`ALI_SMS_ACCESS_KEY_SECRET`、`ALI_SMS_SIGN_NAME`、`ALI_SMS_TEMPLATE_CODE`。

```text
任务：为这个 React + Vite + Supabase 项目增加「手机号验证码登录」，通道用阿里云短信，手机号账号与现有邮箱账号各自独立，不做绑定合并、不做手机号密码登录、只支持中国大陆 11 位号码。

1. 数据库迁移（新建 public.phone_otps）
   字段：id uuid 主键默认 gen_random_uuid()、phone text not null、code_hash text not null、
   expires_at timestamptz not null、attempts int not null default 0、consumed boolean not null default false、
   created_at timestamptz not null default now()。
   建索引 (phone, created_at desc)。
   GRANT ALL ON public.phone_otps TO service_role;（不要给 anon / authenticated 任何权限）
   ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY; 不创建任何策略（仅服务端可访问）。

2. 边缘函数 supabase/functions/send-sms-code/index.ts
   - 处理 OPTIONS，所有响应带 CORS 头。
   - 用 zod 校验 body: { phone: string }，正则 /^1[3-9]\d{9}$/，不匹配返回 400。
   - 频控：同一手机号 60 秒内已有未过期记录则返回 429；当天记录数 >= 10 返回 429。
   - 生成 6 位数字验证码，用 SHA-256(code + phone + 服务端盐) 存 code_hash，expires_at = now()+5 分钟。
   - 调阿里云短信 API（RPC 风格，Action=SendSms，Version=2017-05-25，区域 cn-hangzhou），
     参数 PhoneNumbers=phone、SignName=ALI_SMS_SIGN_NAME、TemplateCode=ALI_SMS_TEMPLATE_CODE、
     TemplateParam=JSON.stringify({ code })。签名用 HMAC-SHA1 的 AccessKey 签名算法，签名逻辑写在
     supabase/functions/_shared/alisms.ts，用 Web Crypto 实现，不要引入 Node SDK。
     阿里云返回 Code !== "OK" 时返回 502 并把厂商错误信息透传到日志（不透传给前端）。
   - 成功返回 { ok: true }，绝不返回验证码本身。

3. 边缘函数 supabase/functions/verify-sms-code/index.ts
   - 校验 body: { phone, code(6 位数字) }。
   - 取该手机号最新一条未 consumed、未过期的记录；不存在返回 400「验证码已失效」。
   - attempts >= 3 返回 429；哈希不匹配则 attempts+1 并返回 400。
   - 匹配成功：置 consumed = true。
   - 用 service_role 客户端按 phone 查找用户（列出用户或维护 profiles.phone 映射）；不存在则
     admin.createUser({ phone, phone_confirm: true })，并在 public.profiles 写入 display_name = 掩码手机号。
   - 通过 admin.generateLink({ type: "magiclink", email: `${phone}@phone.local` }) 或等效方式，
     返回一次性 token_hash 给前端；前端用 supabase.auth.verifyOtp 换取会话。
     若该方式在当前后端不可用，则改为服务端签发会话（admin 创建 session）并返回
     { access_token, refresh_token }，前端调用 supabase.auth.setSession。
   - 任何情况下不要把 service_role key 返回或写入日志。

4. 前端 src/pages/Auth.tsx
   - 在现有邮箱表单上方加两个切换标签：「邮箱」「手机号」，默认邮箱，样式沿用文件里已有的 label / input /
     button / ghostButton 内联样式常量（Swiss Style：0.5px 下划线输入框、10px 大写字距标签、无圆角无阴影）。
   - 手机号面板：手机号输入框 + 「获取验证码」按钮（点击后 60 秒倒计时禁用）+ 6 位验证码输入框 + 「登录」按钮。
   - 调用方式一律用 supabase.functions.invoke("send-sms-code" / "verify-sms-code")，不要拼接 /api/ 路径。
   - 错误用现有的红色小字 error 区展示；成功后沿用现有的 next 参数跳转逻辑。
   - 前端做同样的手机号正则与 6 位数字校验，禁用按钮直到格式合法。

5. 不要改动：额度逻辑（每日 20 次、开发者白名单）、访客试用逻辑、Google 与邮箱登录入口、
   src/integrations/supabase/client.ts、.env。

验收：未注册手机号收到验证码后可直接登录并进入工作台；60 秒内重复点获取验证码被拒；
错误验证码 3 次后被锁；登录后顶部栏正常显示当日剩余额度。
```

## 三、技术说明

- 拖拽部分只动 `src/pages/JobProfile.tsx` 的提示文案逻辑与两个页面的 CSS 高亮选择器，不涉及后端。
- 阿里云 AccessKey 只存后端密钥，前端不可见；验证码只存加盐哈希，不落明文。

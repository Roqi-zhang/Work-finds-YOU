# 项目上 GitHub + 编写 README

## 一、先说清楚 GitHub 部分

Lovable 与 GitHub 是**双向同步**，不是我在后台 push 代码。需要你在编辑器里操作一次：
聊天输入框左下角 **+ → GitHub → Connect project** → 授权 → 选择账号/组织 → **Create Repository**（若已有仓库则选择连接）。

之后仓库会自动持续同步，你在 Lovable 的每次改动都会推到 GitHub。
我这边能做的是：把仓库里要给别人看的文档写好（README、架构图、.env.example），你连接后自动带过去。

> 注：我在计划文件里没有看到你说的仓库链接，可能没保存上。你把链接发我，我会写进 README 的「在线地址 / 源码」一节。


## 二、现有项目架构（已核对代码）

```text
前端  React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui
      src/pages/      Home 首页 · Workbench 双画像工作台 · Match 匹配报告
                      Compare 岗位比较池 · Delivery 投递看板 · Snapshot 分析快照
                      Auth 登录 · NotFound
      src/lib/        ai.ts 云函数调用层 · wfy.ts 数据视图模型 · tasks.ts 跨页任务
                      filestore.ts 文档去重缓存 · guest.ts 访客身份
      src/components/swiss/  TopBar 顶部导航与额度 · ExportMenu 打印式 PDF 导出
      src/styles/     swiss.css 设计系统 · print.css 打印版式 · pages/*.css

后端  Lovable Cloud（Postgres + Auth + Storage + Edge Functions）
      parse-jd       JD/图片 → 岗位画像（含 OCR、评价标准 rubric）
      parse-resume   简历 → 个人能力画像（证据可追溯）
      run-match      双画像比对 → 匹配报告与投前建议
      claim-guest    访客数据在登录后归属认领
      _shared/       ai 网关 · scoring 算分 · quota 额度 · docstore 文档去重
                     schemas 结构定义 · adapter 输出适配 · hash 指纹

数据  job_profiles / user_profiles / match_reports / 投递与比较池 / usage_counters
      全部按 auth.uid() 做行级隔离
```

## 三、README 打算怎么写

面向两类读者：想用产品的人、想看技术的人。结构如下：

1. **标题与一句话定位** — 工作找你 / Job Seek You，AI 求职决策工作台
2. **它解决什么问题** — 投递机会有限，帮你判断该不该投、怎么改
3. **核心功能**（配简短说明）
   - 岗位画像：把 JD 翻译成能力地图
   - 个人画像：把简历翻译成可追溯的能力证据
   - 匹配报告：分数 + 优势/缺口/风险 + 投前 3 步（可复制文案、STAR 面试准备）
   - 比较池：多岗位横向权衡
   - 投递看板：状态流转与分析快照回看
   - 一键导出 PDF / DOCX
4. **最快使用路径** — 粘贴 JD → 上传简历 → 生成匹配 → 加入比较池 → 记录投递
5. **技术栈** — 前端 / 后端 / AI 三块，配上面那张架构图
6. **AI 分析管线简述** — 证据层 → 记录层 → 信号层 → 画像层，后端确定性算分（说明为什么结果可复现）
7. **本地开发** — clone / npm i / npm run dev / npm run test
8. **额度与商业模式** — 访客可完整跑通一次；登录后每日 20 次分析；暂不收费
9. **在线地址** — workfindsyou.cn
10. **License / 说明** — 视你意愿，默认写「保留所有权利，仅供演示」

同时会补一个 `.env.example`（只列变量名，不含真实值）说明需要哪些环境变量。

## 四、需要你确认的两点

- README 用中文为主（现在按中文写），需要中英双语的话我加英文版 `README.en.md`
- 是否公开仓库；公开的话我会再检查一遍代码里没有任何密钥硬编码

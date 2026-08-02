# 接真实数据前的检查计划

目标：在动手接后端之前，先把现有原型里会阻碍真实数据落地的地方全部查清楚、列成清单。这一步只做检查与结论输出，不改任何功能。

## 现状（已确认）

- 5 个页面全部是 `public/previews/` 下的独立静态 HTML（home / profile / jobprofile / match / compare / delivery），React 侧只有 `src/pages/Index.tsx` 一个 iframe 外壳。
- 跨页数据全靠 `localStorage`，键分散在各文件里：`wfy.pool`、`wfy.poolRemoved`、`wfy.deliveries`、`wfy.entryStatus`、`wfy.entryEdits`、`wfy.focus`、`wfy.state.<page>`。
- 读写函数在每个文件里各写了一份（`read/write`、`readStore/writeStore`），没有统一数据层。
- 岗位标识不统一：match 页写死 `JOB.id = "stripe-senior-frontend"`，compare 页用 `slug(公司+职位)` 现算，delivery 页混用两者。
- match 页内容（决策、三判断、投前 3 步、来源列表、分项评分）全部是写死在 HTML 里的中文文案，没有数据插槽。
- delivery 页有 5 条静态记录直接写在 HTML 里，与本地新增记录是两套渲染路径。

## 检查计划（7 项）

### 1. 数据契约盘点
逐页列出「页面上每一个会变的字段」→ 对应后端表与字段，产出一张字段映射表。重点确认 match 页的四段结构、8 维分数、来源列表的字段命名，与之前规划的 `user_profiles / job_profiles / match_reports / applications / application_events` 是否能一一对上，缺什么补什么。

### 2. 实体 ID 统一性检查
核对 match / compare / delivery 三页对同一个岗位是否产生同一个 id。目前是「写死 id」与「slug 现算」并存，接真实数据后必须统一为后端主键（`job_profile_id` / `application_id`）。列出所有需要替换 id 来源的位置。

### 3. 本地存储读写点清点
把所有 `localStorage` 读写点列成清单（键、写入方、读取方、数据形状），判断每个键在接入后端后的归宿：迁移到接口、保留为纯 UI 状态（如折叠、选中项）、或直接废弃（如 `wfy.poolRemoved` 这种「墓碑」写法接后端后不需要）。

### 4. 静态种子数据识别
标出所有写死在 HTML 里、接真实数据后必须变成动态渲染的内容：compare 的 SEED 岗位数组、delivery 的 5 条静态记录、match 的全部文案与评分条、profile/jobprofile 的模拟 8 维分数。同时确认每处是否具备「空态」表现（无数据时页面不塌）。

### 5. 交互逻辑与真实数据的兼容性
逐条验证现有跳转与状态流转在真实数据下是否仍成立：
- 加入对比 / 直接投递的去重逻辑（现在靠 id 比对）
- 对比池按匹配度分环（数据从接口来时环内重排是否仍正确）
- 投递状态下拉 → 时间轴点亮与按日期重排（要改为事件流驱动）
- 编辑态 contenteditable 的内容如何落库

### 6. 迁移路径确认
确认「静态 HTML → React 路由页」的迁移方式与顺序：哪些页面先迁、动效（开花、月相、贝塞尔连线）如何 1:1 保留、`_shared.css` 的 Token 如何转成 Tailwind/CSS 变量。这一步产出迁移顺序与风险点，不动代码。

### 7. 账号与权限前置项
确认登录/注册的接入点（现在所有页面都是匿名可用）、未登录演示态的边界、以及「普通用户只能建立 1 次画像」这一规则需要在哪些页面加拦截。

## 产出

检查完成后输出一份《接入前修复清单》，按「必须先修 / 迁移时顺带修 / 可以先不管」三档排列，每条注明涉及文件与原因。你确认清单后我们再动手改代码。

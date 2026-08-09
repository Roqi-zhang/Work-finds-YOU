# 三项修复：岗位 Key points、导出 PDF 版式、匹配页空白

## 1. 岗位画像不显示 Key points

前端已经写好了渲染逻辑（岗位侧「00 · KEY POINTS · 这个岗位最看重的 3 项能力」），问题出在后端返回值：

- `parse-jd` 有两条命中缓存的快捷通道（浏览器已算出文件哈希、以及文本哈希命中），它们直接从 `job_profiles` 表回放旧结果，返回的字段里 **没有 keyPoints**。
- 只有「全新 JD 完整跑一遍模型」的分支才会返回 `keyPoints`。所以重复上传/曾经解析过的 JD 一律没有 key points；个人简历那边的回放路径带了 keyPoints，所以右侧正常。

修复：

- 缓存回放时一并读取 `ideal_profile`，把其中的 `keyPoints` 放进返回 JSON。
- 若旧记录的 `ideal_profile` 里没有 `keyPoints`（v3 提示词之前生成的），则不走回放、重新分析一次，保证一定有 3 条核心能力。

## 2. 导出 PDF 像截图，需要 1:1 还原网页版式

现在的导出是「html2canvas 截当前 DOM → 整张图塞进一页超长 PDF」，所以视觉上就是一张屏幕截图：折叠内容没展开、每屏 100vh 的留白全被拍进去、背景表盘和导航也在里面，且没有分页。

改造导出流程（只动 `ExportMenu`，不改业务逻辑）：

- 截图前用 html2canvas 的 `onclone` 对副本做打印化处理：展开全部折叠块、把每屏的 `min-height:100vh` 改为自动高度、隐藏顶部导航/侧边进度条/背景表盘、固定为浅色主题和固定内容宽度（A4 比例）。
- 按 A4 宽度渲染，再把长画布按页高切片，逐页 `addImage`，输出多页 A4 PDF，页间不切断到一半的行（按内容块边界就近取整）。
- PNG 导出沿用同一套 onclone 处理，得到完整长图而不是屏幕快照。
- Word 导出保持现状（本来就是结构化文本）。

## 3. 分析完成后进入匹配页显示「还没有岗位」

定位到原因：匹配页拿得到 jobId，也成功调用了后端，但拼装报告时依赖本地的岗位记录：

- `Match.tsx` 里 `const job = getJob(jobId) || localReport?.job;`，`job` 为空就 **什么都不设置**，于是 `report` 保持 null，loading 结束、也没有报错，页面就退回到空状态文案。
- 工作台的「进入匹配」按钮（`Workbench.onMatch`）跳转前 **从未调用 `putJob`** 写入本地岗位记录（只有旧的岗位画像页单独跳转时才写）。带 `fresh=1` 时又不读本地快照，所以 `job` 必为空 → 空白页。

修复：

- `run-match` 的返回值本来就带 `job` 字段，`Match.tsx` 里用它兜底：`getJob(jobId) || localReport?.job || 由返回的 job 组装`，并 `putJob` 落地，供对比池/投递管理复用。
- 兜底之后仍无法组装时，显示明确错误文案而不是「还没有岗位」的空状态。
- 同时在 `Workbench.onMatch` 成功后写入 `putJob` 与 `setUI("match", { jobId })`，双保险。

## 技术细节

- `supabase/functions/parse-jd/index.ts`：`cachedJob()` 增加 `ideal_profile` 字段，返回 `keyPoints`；无 keyPoints 时返回 null 触发重算。
- `src/components/swiss/ExportMenu.tsx`：新增 `onclone` 打印化处理 + A4 多页切片逻辑。
- `src/styles/pages/match.css` / `profile.css`：新增 `.exporting` 类下的版式覆盖（展开折叠、去 100vh、隐藏装饰层）。
- `src/pages/Match.tsx`：使用 `runMatch` 返回的 `job` 兜底并 `putJob`。
- `src/pages/Workbench.tsx`：匹配成功后写入本地岗位记录。

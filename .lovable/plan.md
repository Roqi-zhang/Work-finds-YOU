# 视觉优化方案 — 执行计划

## 你需要提供的材料

**必需**
1. **Demo 访问方式**：线上 URL（我会抓关键页截图）或 Figma 只读链接
   - 若是 Figma：需要通过 Lovable Desktop App + Figma Dev Mode MCP 才能读源文件；否则请导出关键页 PNG 上传
2. **2–4 张参考风格图**：上传 JPG/PNG 即可
3. **每张参考图的"取用点"一句话标注**（可选但强烈推荐），例如：
   - "图 A：取配色与线条粗细"
   - "图 B：取排版层级与字重对比"
   - "图 C：取整体留白节奏，不要它的插画"

**可选补充**
- 品牌名/Logo 是否已定（影响 Landing 头部处理）
- 是否有中英文混排需求（Swiss Style 中英字体配对策略不同）
- 深/浅色模式：只做浅色、只做深色，还是双主题
- 动效强度偏好（静默 / 克制 / 明显）

---

## 交付流程

### 阶段 1 — 风格解析（我做）
- 抓取 demo 现有页面结构截图
- 解析 2–4 张参考图，提取共性 tokens：主色/中性阶、字体族与字重、行高与字距、栅格与间距阶、圆角/线宽、模糊/层级规则、动效语言
- 输出一份 **Style DNA 摘要**（简短文字，非最终稿）供你快速校验方向没跑偏

### 阶段 2 — 3 个方向对比（create_directions）
基于同一套 Style DNA，输出 3 个可点击的完整 HTML 预览方向，锁定配色/字体/布局共性，仅在以下维度分化：
- 方向 A：**克制型** — 极致留白，信息密度低，线条主导
- 方向 B：**信息密集型** — Swiss 网格严格贯彻，密排比对
- 方向 C：**编辑型** — 强字体表现，标题排版作为视觉主角

以核心工作台（匹配视图）作为主预览页，附带 1 个次级页面（Landing 或 Compare）验证系统一致性。

### 阶段 3 — 你确认方向 → 建立组件库
选定方向后，我在项目中落地：

**Design Tokens**（`src/index.css` + `tailwind.config.ts`）
- HSL 语义化变量：background / foreground / muted / accent / border / line-match / line-risk
- 排版尺度、间距阶、圆角、线宽、blur 层级
- 动效 duration / easing

**核心组件**（基于 shadcn 扩展）
- 基础：Button / Badge / Card / Input / Tabs / Dialog 变体重塑
- 领域：ProfilePanel（5+3+2 维）、LineConnector（Bezier match/risk）、GalaxyOrbit、CompareGrid、BoardCard（[W]/[I] 状态）、InterviewCanvas 节点
- 布局：AppShell / GridBackground / SectionHeader

**页面重构顺序**（P0 → P3，全站统一）
1. 匹配视图（Candidate × Job + 连线）
2. Compare Pool（Galaxy + Shift 网格）
3. Delivery Board + Interview Prep Board
4. Landing Page

每阶段完成后你审阅一次，避免走偏。

---

## 技术说明（可跳过）
- 所有颜色以 HSL 存于 `index.css`，组件禁用硬编码 `text-white` / `bg-[#...]`
- 连线用 SVG `<path>` + `ResizeObserver` 重绘
- Galaxy 与 Interview Canvas 用 Framer Motion 处理拖拽与轨道过渡
- 保留你现有的路由与数据流，仅替换 presentational 层

---

## 现在需要你做的
上传参考图 + 提供 demo 链接（或导出的关键页截图）+ 回答上面"可选补充"里你关心的项即可，其余我用默认假设推进。收到材料后我进入阶段 1。
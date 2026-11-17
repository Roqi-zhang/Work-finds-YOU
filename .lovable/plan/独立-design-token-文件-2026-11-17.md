# 独立 Design Token 文件

目标：把散落在样式里的设计规范整理成一份独立、可导出的 Token 文件，页面外观完全不变。

## 产出
1. `design-tokens.json`（W3C Design Tokens 格式，可直接导入 Figma Tokens Studio）
   - 颜色：paper / ink / ink-strong / line / line-soft，浅色与深色两套
   - 字体：手写体 Patrick Hand + ZCOOL KuaiLe，字号层级（10 / 14 / 30px 等现用值）
   - 线条：0.5px 细线
   - 动效：600ms 时长与缓动曲线
   - 间距：页面边距 40 / 56 / 96px 等现用值
2. `src/styles/tokens.ts`：同一套数值的代码版本，供组件引用。
3. 导出一份 `/mnt/documents/design-tokens.json` 和一页说明文档（Markdown，含色板与用途）供你下载。

## 不改动
- 不改任何页面视觉、布局或交互。
- 现有 `swiss.css` 中的变量保持原值，仅加注释指向新文件为唯一来源。

## 技术细节
- 从 `swiss.css` 根变量与 `index.css` 中实际使用的语义变量提取数值，逐项核对，不新增未使用的值。
- `index.css` 里 shadcn 默认蓝灰色值标注为「组件库默认，未定制」，不混入品牌色。
- 在 AGENTS.md 记录：设计数值以 design-tokens.json 为准。

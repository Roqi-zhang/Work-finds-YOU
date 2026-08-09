# 三项修改：对比页节点标签 / 工作台冗余模块 / 首页环形导航

## 1. 对比页节点同时显示公司与岗位

现在轨道上的节点标签只有公司名（`j.co`），12 个岗位里认不出是哪个职位。改为两行标签：

```text
影石INSTA360
产品经理（增长方向）
```

- 第一行：公司名，保持现有大写等宽小字样式。
- 第二行：岗位名，字号再小一档、颜色更淡（次要信息），过长按约 14 字截断加省略号。
- 右侧详情面板、选中态、连线逻辑全部不变。

## 2. 工作台去掉步骤条与 PARSER 模块

左右两栏中蓝框里的内容整块删除：

- 左栏：`01 上传 JD / 02 建立岗位画像 / 03 下一步` 步骤条 + `PARSER` 标题与月相点。
- 右栏：`01 上传简历 / 02 建立画像 / 03 进入匹配` 步骤条 + `PARSER` 标题与月相点。

只在合并后的工作台（embedded 模式）隐藏，标题、说明文字、上传区、能力花、分析列表、底部按钮全部不变。

## 3. 首页环形导航文案与顺序对齐顶部导航

现在圆环上写的是 `01 CANDIDATE / 画像`、`02 PROFILE`、`03 MATCH`、`04 COMPARE`、`05 DELIVERY`，与顶部导航不一致。改为与顶部导航完全一致：

```text
01 HOME   02 WORKBENCH   03 MATCH   04 COMPARE   05 DELIVERY
```

节点位置、圆环、CTA「开始分析」及旋转动效均不变，只替换文字。

## 技术说明

- `src/pages/Compare.tsx`：`render()` 里给每个节点补一条 `text.node-label.sub`（`y="18"`）显示 `j.title`，新增样式写进 `src/styles/pages/compare.css`。
- `src/pages/JobProfile.tsx` / `src/pages/Profile.tsx`：`.steps` 块与底部 Parser 块加 `hidden={embedded}`，非合并页路径保持原样。
- `src/pages/Home.tsx`：把顶部 tick 的 `CANDIDATE / 画像` 改为 `HOME`，`PROFILE` 改为 `WORKBENCH`，序号 01–05 与顶部导航对齐。

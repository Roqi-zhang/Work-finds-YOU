# 修复 404 + 回滚确认

## 现状核查（已验证）

- `public/previews/profile.html` 与 `public/previews/profile.html.baseline` 内容完全一致（diff 无差异），所以**当前已经就是基线版本**，无需回滚，也不会有内容丢失。
- 本地打开 `http://localhost:8080/` 正常渲染预览面板（PREVIEW + 7 个页签），`/previews/profile.html` 返回 200。
- 各预览页之间的导航链接都是相对路径（`./profile.html` 等），本身正确。

结论：404 不是文件损坏造成的，而是预览面板当前停留在一个 React 路由里不存在的地址（例如从 iframe 里点链接把顶层地址带到 `/profile` 之类），此时只有 `/` 有路由，其余全部落到 NotFound 页面。

## 修改内容

1. **兜底路由**：在 `src/pages/NotFound.tsx` 之外，让 App 对未知路径自动跳回预览首页（`<Route path="*" element={<Navigate to="/" replace />} />`），这样任何误跳转都会回到预览面板而不是 404。
2. **深链支持**：为每个预览页加一条路由别名（`/home`、`/profile`、`/jobprofile`、`/match`、`/compare`、`/delivery`），打开对应地址时预览面板直接选中该页签，避免再出现"点了链接就 404"。
3. **回滚**：保持 `profile.html` 现状（已等于 baseline）。若你确认页面内容也有异常，我再执行 `cp profile.html.baseline profile.html` 覆盖一次。

## 不改动

- 不改任何预览页 HTML 的视觉、布局、花瓣透明度与交互逻辑。

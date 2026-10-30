# 修复：候选人画像缺少 Key Points

## 原因
同一份简历再次分析时，系统会直接复用之前保存的结果（秒级命中）。这条复用路径只返回了维度和分区内容，没有把 Key Points 一起返回；另外，在 Key Points 功能上线之前保存的旧结果里本来就没有 Key Points。岗位画像那边已经处理了这两种情况，所以岗位侧正常、候选人侧缺失。

## 修改（只动这一处，其他不变）
1. 候选人分析复用旧结果时，把保存的 Key Points 一并返回。
2. 如果旧结果里没有 Key Points，就不复用，重新分析一次以补齐（与岗位画像的做法一致）。
3. 页面读取时兼容两种位置，确保拿到就显示在「00 · KEY POINTS」区块。

## 验证
用同一份简历点「重新建立候选人画像」，确认右栏出现 3 条 Key Points，刷新后仍在。

## 技术细节
- `supabase/functions/parse-resume/index.ts` 命中缓存分支：返回 `keyPoints: hit.sections?.keyPoints`；为空则跳过缓存继续调用模型。部署该函数。
- `src/pages/Profile.tsx`：`out.keyPoints ?? out.sections?.keyPoints ?? []`。

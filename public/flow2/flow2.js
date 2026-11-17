(()=>{const D=F2,DIR=document.body.dataset.dir,$=s=>document.querySelector(s);
const S=[["a1","A1 上传简历"],["a2","A2 核对提取"],["a3","A3 补充问题"],["b","B 岗位输入"],["e1","E1 分析中"],["e2","E2 异常态"],["c","C 单岗位"],["d","D 对比"]];
const NAMES={d1:"方向一 · 求职日记本",d2:"方向二 · 决策桌面",d3:"方向三 · 证据板"};
let cur=location.hash.slice(1)||"a1",job="A",ans={};
const demo=`<span class="demo">演示数据 · 基于当前画像与可获得信息的参考估计</span>`;
const flower=(n=5,s=72)=>`<svg class="flower" style="width:${s}px;height:${s}px" viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="1">${[...Array(n)].map((_,i)=>`<path d="M0 0 C 10 -12, 8 -34, 0 -40 C -8 -34, -10 -12, 0 0" transform="rotate(${i*360/n})"/>`).join("")}<circle r="4"/></svg>`;
const meter=v=>`<div class="meter"><i style="width:${v*20}%"></i></div>`;
const ftag=t=>t==="官方"?`<span class="tag solid">官方</span>`:`<span class="tag dash">个人经验 · 仅供参考</span>`;
const steps=i=>`<div class="steps mono">${["01 建立画像","02 上传岗位","03 分析","04 决策"].map((s,k)=>`<span class="${k==i?"on":""}">${s}</span>`).join("")}</div>`;
const decide=j=>`<div class="row"><button class="btn pri" data-dec="决定投递" data-j="${j}">决定投递</button><button class="btn" data-dec="待定" data-j="${j}">待定</button><button class="btn ghost" data-dec="暂不投递" data-j="${j}">暂不投递</button></div>`;
const go=(s,label,cls="btn")=>`<button class="${cls}" data-go="${s}">${label}</button>`;
// frame per direction
function frame(body,margin=""){
 if(DIR==="d1")return `<div class="sheet"><div class="date"><b>17</b>十一月 · 周二<br><span class="cap">第 ${S.findIndex(x=>x[0]==cur)+1} 页</span><div style="margin-top:24px">${flower(5,56)}</div></div><div>${body}</div><div class="margin">${margin||'<span class="cap">页边批注</span>'}</div></div>`;
 if(DIR==="d2")return `<div class="desk"><aside class="side">${side()}</aside><div class="paper">${body}${margin?`<div style="margin-top:24px;border-top:.5px solid var(--line);padding-top:12px" class="cap">${margin}</div>`:""}</div></div>`;
 return `${body}${margin?`<div style="margin-top:32px" class="cap">${margin}</div>`:""}`;
}
function side(){return `<div class="mono">当前画像</div><div class="row" style="margin:10px 0">${flower(6,56)}<div><h3>${D.user.name}</h3><div class="cap">${D.user.target}</div></div></div><div class="cap">${D.user.version}</div><hr class="hair" style="margin:12px 0">${D.skills.map(s=>`<span class="tag" style="margin:0 4px 4px 0;display:inline-block">${s}</span>`).join("")}<hr class="hair" style="margin:12px 0"><div class="mono">待补充</div>${D.gaps.map(g=>`<div class="cap">[ ] ${ans[g]||g}</div>`).join("")}`}
const V={
a1:()=>frame(`${steps(0)}<h1 style="margin:24px 0 8px">先认识一下你</h1><p class="cap">上传简历后，AI 会提取经历与技能，你可以逐条核对。</p><label class="drop" style="display:block;margin:28px 0;cursor:pointer"><input type="file" hidden data-up>${flower(5,64)}<h2 style="margin-top:12px">拖拽或点选上传简历</h2><div class="cap">PDF / Word / 图片 · 单个文件</div></label><div class="row">${go("a2","用示例简历继续","btn pri")}<span class="cap">文件只用于建立你的画像</span></div>`,`把最近一版简历放进来就好，不必完美。`),
a2:()=>frame(`${steps(0)}<h1 style="margin:24px 0">核对 AI 提取的内容</h1><div class="cap" style="margin-bottom:12px">示例简历 · 林小满.pdf · 提取完成</div>
<h3>基本信息</h3><div class="grid2" style="margin:8px 0 20px"><label class="cap">姓名<input value="${D.user.name}"></label><label class="cap">学历<input value="${D.user.edu}"></label></div>
<h3>经历</h3>${D.exp.map(e=>`<div class="li"><span class="mark">[${e[0][0]}]</span><div><input value="${e[1]}"><div class="cap" contenteditable>${e[2]}</div></div></div>`).join("")}
<h3 style="margin-top:20px">技能</h3><div class="row" style="margin:8px 0 24px">${D.skills.map(s=>`<span class="tag">${s} ×</span>`).join("")}<span class="tag dash">+ 添加</span></div>
<div class="row">${go("a1","重新上传","btn ghost")}${go("a3","信息无误，下一步","btn pri")}</div>`,`<b>提示</b><br>“月活约 1,200”来自简历自述，AI 不做核实。`),
a3:()=>frame(`${steps(0)}<h1 style="margin:24px 0 8px">还差两件小事</h1><p class="cap">回答能让分析更贴合你，也可以跳过，之后随时补。</p>
<div class="box" style="margin:20px 0"><h3>1. 你希望在哪个城市工作？</h3><div class="row" style="margin-top:10px">${["上海","杭州","北京","深圳","都可以"].map(c=>`<button class="chip" data-a="目标城市" data-v="城市：${c}">${c}</button>`).join("")}</div></div>
<div class="box"><h3>2. 选岗位时你最看重什么？</h3><div class="row" style="margin-top:10px">${["成长与带教","业务方向","薪资","稳定性"].map(c=>`<button class="chip" data-a="最重视的选择因素" data-v="看重：${c}">${c}</button>`).join("")}</div></div>
<h2 style="margin:28px 0 10px">画像摘要 <span class="cap">${D.user.version}</span></h2><div class="box ${DIR=='d1'?'ruled':''}">${D.user.name} · ${D.user.target}<br>核心经历：B 端数据看板改版实习、C 端小程序 0→1<br>擅长：${D.skills.slice(0,4).join("、")}<br>${D.gaps.map(g=>ans[g]?ans[g]:`<span class="tag dash">待补充 · ${g}</span>`).join(" ")}</div>
<div class="row" style="margin-top:20px">${go("b","跳过","btn ghost")}${go("b","保存画像，去添加岗位","btn pri")}</div>`,`画像可长期复用；每次修改会生成新版本，旧的分析仍按旧版本保留。`),
b:()=>frame(`${steps(1)}<h1 style="margin:24px 0 8px">想了解哪些岗位？</h1><div class="cap">本次使用：${D.user.version} · <a class="src" data-go="a3">修改画像</a></div>
${D.jobs.map((j,i)=>`<div class="box" style="margin-top:16px"><div class="row" style="justify-content:space-between"><h3>岗位 ${j.id}</h3><span class="mono">${i?"[链接] 已读取":"[文本] 已粘贴"}</span></div><div class="row" style="margin:8px 0"><span class="tag ${i?"":"solid"}">粘贴文本</span><span class="tag ${i?"solid":""}">链接</span><span class="tag">上传文件</span></div>${i?`<input value="https://example.com/jobs/shiguang-design（示意）">`:`<textarea>${j.co} · ${j.title}\n岗位职责：负责审批流与权限配置模块交互设计…</textarea>`}<div class="cap" style="margin-top:6px">✓ 可分析 · 识别到：${j.co} · ${j.title} · ${j.city}</div></div>`).join("")}
<div class="box" style="margin-top:16px;border-style:dashed;text-align:center">+ 再添加一个岗位</div>
<div class="row" style="margin-top:24px">${go("e1","开始分析 2 个岗位","btn pri")}<span class="cap">一次完成岗位解析、资料查找和匹配分析，约 1–2 分钟</span></div>`,`可以离开本页，分析会在后台继续。`),
e1:()=>{const st=[["解析岗位","完成","识别职责 6 条、要求 8 条"],["寻找相关公开资料","进行中","已找到 公司官网 1、个人经验分享 2；仍在检索…"],["结合画像分析","等待",""]];
 return frame(`${steps(2)}<h1 style="margin:24px 0 8px">正在分析 2 个岗位</h1><div class="cap">${D.user.version}</div>
 ${D.jobs.map((j,ji)=>`<div class="box" style="margin-top:16px"><h3>${j.co} · ${j.title}</h3>${st.map((s,i)=>`<div class="li"><span class="mark">${s[1]=="完成"?"[✓]":s[1]=="进行中"?'<span class="spin">◌</span>':"[ ]"}</span><div><b>${s[0]}</b> <span class="cap">${ji&&i==1?"进行中":s[1]}</span><div class="cap">${s[2]}</div></div></div>`).join("")}</div>`).join("")}
 <div class="row" style="margin-top:20px">${go("c","查看结果（演示跳过等待）","btn pri")}${go("e2","查看异常态示例","btn ghost")}</div>`,`我们不会在资料不足时编造结果，会直接告诉你缺什么。`)},
e2:()=>frame(`${steps(2)}<h1 style="margin:24px 0">部分结果需要你留意</h1>
<div class="box"><div class="row" style="justify-content:space-between"><h3>岗位 A · ${D.jobs[0].co}</h3><span class="tag solid">分析完成</span></div><div class="cap">匹配度 78% ${demo}</div></div>
<div class="box" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>岗位 B · ${D.jobs[1].co}</h3><span class="tag dash">资料不足</span></div><p>未找到该公司可靠的公开资料，仅基于 JD 分析。<b>不显示精确匹配度</b>，给出区间：中等（约 55–70）。</p><div class="row" style="margin-top:8px"><button class="btn ghost">补充公司链接</button><button class="btn ghost">仅用 JD 继续</button></div></div>
<div class="box" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>岗位 C · 链接岗位</h3><span class="tag dash">链接失效</span></div><p>链接无法打开（页面可能已下线）。请粘贴 JD 文本或上传截图。</p><button class="btn ghost" style="margin-top:8px">改为粘贴文本</button></div>
<div class="box" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>岗位 D</h3><span class="tag dash">分析失败</span></div><p>服务暂时繁忙，本次未消耗额度。</p><button class="btn" style="margin-top:8px">重试</button></div>
<div class="row" style="margin-top:20px">${go("c","查看岗位 A 结果","btn pri")}${go("d","对比已完成岗位","btn")}</div>`,`异常态与成功态并列展示，失败项不会混入对比。`),
c:()=>C(),d:()=>Dv()};
function sources(j){return `<h2 id="src" style="margin-top:32px">资料来源</h2>${j.srcs.map((s,i)=>`<div class="li"><span class="mark">[${i+1}]</span><div class="row" style="justify-content:space-between"><span><a class="src" href="#" onclick="return false">${s[0]}</a> <span class="cap">${s[1]}</span></span>${ftag(s[2])}</div></div>`).join("")}<div class="cap">链接均为示意占位。</div>`}
function C(){const j=D.jobs.find(x=>x.id==job);const tabs=`<div class="row" style="margin-bottom:16px">${D.jobs.map(x=>`<button class="chip ${x.id==job?"tag solid":""}" data-job="${x.id}">岗位 ${x.id}</button>`).join("")}${go("d","对比两个岗位","chip")}</div>`;
 const head=`${tabs}<div class="cap">${j.co} · ${j.city} · ${D.user.version}</div><h1>${j.title}</h1>`;
 const summary=`经历与岗位的复杂流程设计方向一致，主要差距在${j.gap[0][0].replace("缺少","")}；建议投递前补一页针对性作品。`;
 const score=`<div class="row"><span style="font-size:48px;color:var(--ink-strong);line-height:1">${j.score}%</span><div style="flex:1;min-width:200px">${meter(j.score/20)}<div style="margin-top:6px">${demo}</div><div class="cap">依据 ${j.match.length} 条匹配 · ${j.gap.length} 条差距 · ${j.unk.length} 项未知 · <a class="src" href="#src">查看分析</a></div></div></div>`;
 const reqs=j.req.map(r=>`<div style="display:grid;margin:8px 0"><div class="row" style="justify-content:space-between"><span>${r[0]}</span><span class="cap">来源 · ${r[2]}</span></div>${meter(r[1])}</div>`).join("");
 const lists=`<div class="grid3" style="margin-top:12px"><div><h3>✓ 有证据的匹配</h3>${j.match.map(m=>`<div class="li"><span class="mark">[+]</span><div>${m[0]}<div class="cap">${m[1]} ↔ ${m[2]}<span class="fn">1</span></div></div></div>`).join("")}</div><div><h3>△ 可能的差距</h3>${j.gap.map(m=>`<div class="li"><span class="mark">[−]</span><div>${m[0]}<div class="cap">${m[1]}<span class="fn">${m[1].includes("经验")?3:1}</span></div></div></div>`).join("")}</div><div><h3>? 无法判断</h3>${j.unk.map(m=>`<div class="li"><span class="mark">[?]</span><div>${m}</div></div>`).join("")}</div></div>`;
 const tips=`<h2 style="margin-top:28px">投递前可以做的</h2>${j.tips.map((t,i)=>`<div class="li"><span class="mark">0${i+1}</span><div>${t}</div></div>`).join("")}`;
 const know=`<div class="grid3" style="margin-top:12px"><div><div class="mono">公司做什么</div>${j.does}<span class="fn">2</span></div><div><div class="mono">岗位做什么</div>${j.role}<span class="fn">1</span></div><div><div class="mono">核心能力</div>${reqs}</div></div>`;
 const tail=`<div class="box" style="margin-top:32px"><h3>你的决定</h3><div class="cap" style="margin-bottom:10px">AI 只提供依据，决定权在你。</div>${decide(j.id)}</div>`;
 if(DIR==="d1")return frame(`${head}<div class="note">“${summary}”</div>${score}<h2 style="margin-top:28px">认识这个岗位</h2>${know}<h2 style="margin-top:28px">和你的关系</h2>${lists}${tips}${tail}${sources(j)}`,`<b>页边批注</b>${j.srcs.map((s,i)=>`<div style="margin:10px 0">[${i+1}] ${s[0]}<br>${ftag(s[2])}<br><span class="cap">${s[1]}</span></div>`).join("")}`);
 if(DIR==="d2")return frame(`${head}<div class="box" style="margin:16px 0"><div class="mono">一句话判断</div><h2>${summary}</h2></div>${score}${know}${lists}${tips}${tail}${sources(j)}`);
 return frame(`${head}<div class="verdict grid2" style="margin-top:12px"><div><div class="mono">结论</div><h2>${summary}</h2></div>${score}</div>
 <table style="margin-top:20px"><tr><th style="width:22%">判断</th><th>证据</th><th style="width:22%">来源</th></tr>
 ${j.req.map(r=>`<tr><td>岗位要求：${r[0]}</td><td>${meter(r[1])}</td><td>${r[2]=="JD"?ftag("官方")+" JD":ftag("")}</td></tr>`).join("")}
 ${j.match.map(m=>`<tr><td>[+] 匹配</td><td>${m[0]}</td><td>${m[1]} ↔ ${m[2]}</td></tr>`).join("")}
 ${j.gap.map(m=>`<tr><td>[−] 差距</td><td>${m[0]}</td><td>${m[1]}</td></tr>`).join("")}
 ${j.unk.map(m=>`<tr><td>[?] 待确认</td><td>${m}</td><td class="cap">未找到可靠信息</td></tr>`).join("")}</table>${tips}${tail}${sources(j)}`);
}
function Dv(){const [a,b]=D.jobs;const rows=[["岗位职责",j=>j.role],["公司做什么",j=>j.does],["核心要求",j=>j.req.map(r=>`${r[0]} ${"●".repeat(r[1])}${"○".repeat(5-r[1])}`).join("<br>")],["你的匹配证据",j=>j.match.map(m=>"[+] "+m[0]).join("<br>")],["可能的差距",j=>j.gap.map(m=>"[−] "+m[0]).join("<br>")],["待补充 / 未知",j=>j.unk.map(u=>"[?] "+u).join("<br>")],["城市（你的偏好："+(ans["目标城市"]||"待补充")+"）",j=>j.city],["参考匹配度",j=>`${j.score}% <span class="demo">演示</span>`]];
 const diff=`<div class="box" style="margin:16px 0"><div class="mono">影响优先级的差异（AI 概括，非排序）</div><p>A 与你的 B 端实习更贴近，差距集中在业务知识；B 更看重增长实验与视觉表现，需要补作品。若你更看重“${ans["最重视的选择因素"]?.slice(3)||"成长与带教"}”，两者都缺可靠信息，建议向 HR 确认。</p></div>`;
 const head=`<div class="cap">同一画像：${D.user.version} · 分析时间 2026-11-17 20:10 · 未自动排序</div><h1 style="margin:6px 0">两个岗位并排看</h1>`;
 const foot=j=>`<div style="margin-top:12px"><button class="btn ghost" data-job="${j.id}" data-go="c">查看详情</button><div style="margin-top:10px">${decide(j.id)}</div></div>`;
 if(DIR==="d3")return frame(`${head}${diff}<table><tr><th style="width:18%">维度</th><th>A · ${a.co}<br>${a.title}</th><th>B · ${b.co}<br>${b.title}</th></tr>${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1](a)}</td><td>${r[1](b)}</td></tr>`).join("")}<tr><td></td><td>${foot(a)}</td><td>${foot(b)}</td></tr></table>`);
 const col=j=>`<div class="${DIR=='d2'?'paper':'box'}"><div class="mono">岗位 ${j.id} · ${j.city}</div><h2>${j.co}</h2><div>${j.title}</div>${rows.map(r=>`<div style="margin-top:14px"><div class="mono">${r[0]}</div>${r[0]=="可能的差距"&&DIR=="d2"?`<span class="circ">${r[1](j)}</span>`:r[1](j)}</div>`).join("")}${foot(j)}</div>`;
 if(DIR==="d2")return `${head}${diff}<div class="grid2">${col(a)}${col(b)}</div>`;
 return frame(`${head}${diff}<div class="grid2">${col(a)}${col(b)}</div>`,`两页纸放在一起读：圈出你在意的差异，再做决定。`);
}
function render(){$("#nav").innerHTML=S.map(s=>`<button data-go="${s[0]}" class="${s[0]==cur?"on":""}">${s[1]}</button>`).join("");$("#app").innerHTML=V[cur]();$("#dirname").textContent=NAMES[DIR];scrollTo(0,0);location.hash=cur}
document.addEventListener("click",e=>{const t=e.target.closest("[data-go],[data-job],[data-a],[data-dec],#theme,#cancel,#ok");if(!t)return;
 if(t.id=="theme"){document.documentElement.dataset.theme=document.documentElement.dataset.theme=="dark"?"":"dark";return}
 if(t.id=="cancel"){$("#modal").classList.remove("on");return}
 if(t.id=="ok"){$("#modal").classList.remove("on");const m=$("#toast");m.innerHTML=`已记录「${$("#dt").textContent}」· 正在进入投递管理…（原有页面）`;m.style.display="block";setTimeout(()=>m.style.display="none",2600);return}
 if(t.dataset.dec){$("#dt").textContent=t.dataset.dec;$("#dj").textContent=D.jobs.find(x=>x.id==t.dataset.j).title;$("#modal").classList.add("on");return}
 if(t.dataset.a){ans[t.dataset.a]=t.dataset.v;render();return}
 if(t.dataset.job)job=t.dataset.job;if(t.dataset.go)cur=t.dataset.go;render()});
document.addEventListener("change",e=>{if(e.target.matches("[data-up]")){cur="a2";render()}});
addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(h&&h!==cur&&V[h]){cur=h;render()}});render()})();

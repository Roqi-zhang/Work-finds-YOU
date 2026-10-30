const FN = "https://itrhtuoavezgwfdcqlty.supabase.co/functions/v1/save-job";
const SITE = "https://workfindsyou.cn";
const KEY = "sb_publishable_AphmyxnULt6ZwKQ8212mBQ_62rXkat0";
const $ = (id) => document.getElementById(id);
const form = $("form");
const headers = (token) => ({ "Content-Type": "application/json", apikey: KEY, "x-wfy-token": token });

async function init() {
  const { wfyToken, wfyEmail, wfySelection } = await chrome.storage.local.get(["wfyToken", "wfyEmail", "wfySelection"]);
  if (!wfyToken) { $("connect").hidden = false; return; }
  $("who").textContent = wfyEmail || "";
  form.hidden = false;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let data = { url: tab.url, title: tab.title };
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] });
    if (r?.result) data = r.result;
  } catch (_) { $("msg").textContent = "此页面无法读取，请手动填写。"; }
  if (wfySelection) { data.jd_text = wfySelection; chrome.storage.local.remove("wfySelection"); }
  form.dataset.url = data.url;
  for (const k of ["title", "company", "location", "salary", "jd_text"]) form.elements[k].value = data[k] || "";
  fetch(FN + "?url=" + encodeURIComponent(data.url), { headers: headers(wfyToken) })
    .then((r) => r.json()).then((j) => {
      if (j.error) return logoutWith(j.error);
      if (j.existing) { $("dup").hidden = false; form.elements.status.value = j.existing.status; }
    }).catch(() => {});
}

async function logoutWith(m) {
  await chrome.storage.local.remove(["wfyToken", "wfyEmail"]);
  form.hidden = true; $("connect").hidden = false;
  if (m) $("connect").querySelector("p").textContent = m;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { wfyToken } = await chrome.storage.local.get("wfyToken");
  const body = Object.fromEntries(new FormData(form));
  body.url = form.dataset.url;
  $("save").disabled = true; $("msg").textContent = "保存中…";
  try {
    const r = await fetch(FN, { method: "POST", headers: headers(wfyToken), body: JSON.stringify(body) });
    const j = await r.json();
    if (r.status === 401) return logoutWith(j.error);
    $("msg").innerHTML = j.ok ? (j.updated ? "已更新。" : "已保存。") + ` <a href="${SITE}/delivery" target="_blank">打开投递管理 →</a>` : j.error || "保存失败";
  } catch (_) { $("msg").textContent = "网络错误，请重试"; }
  $("save").disabled = false;
});

$("openConnect").onclick = () => chrome.tabs.create({ url: SITE + "/extension/connect" });
$("saveCode").onclick = async () => {
  const v = $("code").value.trim();
  if (!v.startsWith("wfy_")) return;
  await chrome.storage.local.set({ wfyToken: v });
  location.reload();
};
$("logout").onclick = (e) => { e.preventDefault(); logoutWith(); };
init();

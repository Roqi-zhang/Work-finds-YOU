// Receives the connection code from the Work Find You /extension/connect page.
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.type !== "WFY_EXTENSION_TOKEN" || !e.data.token) return;
  chrome.storage.local.set({ wfyToken: e.data.token, wfyEmail: e.data.email || "" });
});

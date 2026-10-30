chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "wfy-save", title: "保存为 JD 到 Work Find You", contexts: ["selection"] });
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "wfy-save") return;
  chrome.storage.local.set({ wfySelection: info.selectionText || "" }, () => chrome.action.openPopup?.());
});

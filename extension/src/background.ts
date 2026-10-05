const MENU_SELECTION = "reploop-add-selection";

async function openPanel(tabId?: number) {
  if (tabId === undefined) {
    return;
  }
  await chrome.sidePanel.open({ tabId });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: "用 RepLoop 查询“%s”",
    contexts: ["selection"]
  });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_SELECTION || !info.selectionText) {
    return;
  }
  void chrome.storage.local
    .set({ pendingSelection: info.selectionText.trim() })
    .then(() => openPanel(tab?.id));
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "REPLOOP_OPEN_SELECTION") {
    return;
  }
  const text = String(message.text ?? "").trim();
  if (!text) {
    return;
  }
  void chrome.storage.local
    .set({ pendingSelection: text })
    .then(() => openPanel(sender.tab?.id));
});

chrome.action.onClicked.addListener((tab) => {
  void openPanel(tab.id);
});

// 后台脚本 - 作为 popup 和 content script 之间的桥梁
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'fetchWeeklyData':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getWeeklyData' }, (response) => {
            sendResponse(response);
          });
        } else {
          sendResponse({ success: false, error: '无法获取当前标签页' });
        }
      });
      return true;

    case 'contentScriptLoaded':
      console.log('日报数据获取扩展: Content script 已加载');
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: '未知操作' });
  }
});
// 后台脚本 - 作为 popup 和 content script 之间的桥梁
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 转发获取数据的请求到 content script
  if (request.action === 'fetchWeeklyData') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getWeeklyData' }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false, error: '无法获取当前标签页' });
      }
    });
    return true; // 保持消息通道开放
  }
});

// 监听 content script 加载完成
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contentScriptLoaded') {
    console.log('日报数据获取扩展: Content script 已加载');
  }
});

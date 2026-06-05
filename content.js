// 内容脚本 - 注入到目标页面获取数据
(function() {
  'use strict';

  // 配置
  const BASE_URL = 'https://gs.capinfo.com.cn';

  // 计算本周日期范围（周一到周日）
  function getWeekRange() {
    const today = new Date();
    const monday = new Date(today);
    const dayOfWeek = today.getDay();
    // 如果是周日(0)，则向前6天到周一
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(today.getDate() - daysToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
      start: formatDate(monday),
      end: formatDate(sunday)
    };
  }

  // 格式化日期为 YYYY-MM-DD
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 从 Cookie 获取 Admin-Token
  function getAdminToken() {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'Admin-Token') {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  // 获取本周日报数据（stat API 一次返回本周所有数据）
  async function fetchWeeklyData(token, startDate, endDate) {
    // 使用周一的日期调用 stat API
    const url = `${BASE_URL}/api/mh/hour/stat?date=${startDate}&projectId=&flowState=`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Referer': `${BASE_URL}/pc/index.html`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('获取数据失败:', error);
      throw error;
    }
  }

  // 解析工时数据，提取需要的字段
  function parseHourData(response) {
    if (!response || !response.data || !Array.isArray(response.data)) {
      return [];
    }

    const result = [];

    for (const item of response.data) {
      const date = item.date;
      const projectHours = item.projectHours || [];

      for (const proj of projectHours) {
        result.push({
          date: date,
          projectId: proj.projectId,
          projectName: proj.projectName || '',
          useHour: proj.useHour || 0,
          workContent: proj.daily || '',
          nickName: item.nickName || '',
          flowState: item.flowState || '',
          fillTime: item.fillTime || '',
          status: item.status
        });
      }
    }

    return result;
  }

  // 监听来自 popup 或 background 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getWeeklyData') {
      const token = getAdminToken();

      if (!token) {
        sendResponse({ success: false, error: '未找到 Admin-Token，请确保已登录' });
        return true;
      }

      const { start, end } = getWeekRange();

      fetchWeeklyData(token, start, end)
        .then(apiResult => {
          const parsedData = parseHourData(apiResult);
          sendResponse({
            success: true,
            data: parsedData,
            weekRange: { start, end },
            rawResponse: apiResult
          });
        })
        .catch(error => {
          sendResponse({
            success: false,
            error: error.message || '获取数据失败',
            weekRange: { start, end }
          });
        });

      return true; // 异步响应
    }

    if (request.action === 'checkLogin') {
      const token = getAdminToken();
      sendResponse({ loggedIn: !!token });
      return false;
    }
  });

  // 通知 background script 已加载
  chrome.runtime.sendMessage({ action: 'contentScriptLoaded' });
})();

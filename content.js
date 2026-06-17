// 内容脚本 - 注入到目标页面获取数据
(function () {
  'use strict';

  // 配置
  const BASE_URL = 'https://gs.capinfo.com.cn';

  // 格式化日期为 YYYY-MM-DD
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 获取本周一和今天（截止到当天）的 YYYY-MM-DD 字符串
  function getThisWeekRangeToToday() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0周日 ~ 6周六
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMonday);
    return {
      start: formatDate(monday),   // 字符串 'YYYY-MM-DD'
      end: formatDate(today)       // 字符串 'YYYY-MM-DD'
    };
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

  // 获取本月数据（传入周一日期，接口实际返回整月数据）
  async function fetchMonthlyData(token, dateParam) {
    const url = `${BASE_URL}/api/mh/hour/stat?date=${dateParam}&projectId=&flowState=`;
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

  // 解析工时数据，并过滤出本周一到今天的记录（使用字符串比较日期）
  function parseAndFilterHourData(response, weekStartStr, weekEndStr) {
    if (!response || !response.data || !Array.isArray(response.data)) {
      return { data: [], message: '接口返回数据格式不正确' };
    }

    const result = [];
    for (const item of response.data) {
      const itemDate = item.date; // 格式 'YYYY-MM-DD'
      // 直接字符串比较（字典序对 YYYY-MM-DD 有效）
      if (itemDate < weekStartStr || itemDate > weekEndStr) {
        continue;
      }
      const projectHours = item.projectHours || [];
      for (const proj of projectHours) {
        result.push({
          date: itemDate,
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

    if (result.length === 0) {
      return { data: [], message: '本周暂无日报数据，请确认已填写日报' };
    }
    return { data: result, message: null };
  }

  // 主逻辑：获取本周一到今天的日报数据
  async function getWeeklyDataUpToToday(token) {
    const { start: weekStartStr, end: weekEndStr } = getThisWeekRangeToToday();
    // 使用周一的日期作为请求参数（原方式，可获取整月数据）
    const monthlyData = await fetchMonthlyData(token, weekStartStr);
    return parseAndFilterHourData(monthlyData, weekStartStr, weekEndStr);
  }

  // 监听来自 popup 或 background 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getWeeklyData') {
      const token = getAdminToken();
      if (!token) {
        sendResponse({ success: false, error: '未找到 Admin-Token，请确保已登录' });
        return true;
      }

      getWeeklyDataUpToToday(token)
        .then(parsedResult => {
          const { start, end } = getThisWeekRangeToToday();
          sendResponse({
            success: true,
            data: parsedResult.data,
            message: parsedResult.message,
            weekRange: { start, end }
          });
        })
        .catch(error => {
          sendResponse({
            success: false,
            error: error.message || '获取数据失败'
          });
        });

      return true;
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
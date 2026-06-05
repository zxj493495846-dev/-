// Popup 脚本
document.addEventListener('DOMContentLoaded', () => {
  const fetchBtn = document.getElementById('fetchBtn');
  const copyBtn = document.getElementById('copyBtn');
  const copyMdBtn = document.getElementById('copyMdBtn');
  const copyAiBtn = document.getElementById('copyAiBtn');
  const aiSummaryBtn = document.getElementById('aiSummaryBtn');
  const jsonToggle = document.getElementById('jsonToggle');
  const markdownToggle = document.getElementById('markdownToggle');
  const statusEl = document.getElementById('status');
  const weekRangeEl = document.getElementById('weekRange');
  const resultContainer = document.getElementById('resultContainer');
  const jsonOutput = document.getElementById('jsonOutput');
  const markdownContainer = document.getElementById('markdownContainer');
  const markdownOutput = document.getElementById('markdownOutput');
  const aiSummaryContainer = document.getElementById('aiSummaryContainer');
  const aiSummaryOutput = document.getElementById('aiSummaryOutput');
  const errorContainer = document.getElementById('errorContainer');
  const errorMessage = document.getElementById('errorMessage');

  let currentData = null;
  let currentMarkdown = null;
  let currentAiSummary = null;

  // AI 配置
  const AI_CONFIG = {
    baseUrl: 'https://ai.gitee.com/v1',
    apiKey: '076ISK3NWSGNCMOO3CLDGUDILKA5XT2XDK0ABRDQ',
    model: 'Qwen3-8B'
  };

  // 生成 AI 提示词
  function generateAiPrompt(dailyData, weekRange) {
    const dailyDetails = dailyData.map(item => {
      return `日期：${item.date}\n项目名称：${item.projectName}\n工作内容：${item.workContent}\n`;
    }).join('\n');

    return `[System]
角色：专业周报整理助理，根据用户提供的工作日报信息，按照固定格式生成项目制工作周报。
约束规则：
1. 自动提取：项目名称、项目名称、所有工作日期、每日工作内容；
2. 项目归集：按项目名称自动分组归类，相同项目内容汇总到同一板块；
3. 内容合并优化：同项目跨日期重复的工作内容做凝练整合，剔除重复描述，精简语句，不拆分细碎重复条目；
4. 排版格式严格固定，不许新增、删减层级；
5. 强制内容限制：只输出本周已完成事项，全程禁止出现工时数据、禁止编写后续计划/待办事项；
6. 统计周期生成逻辑：统计周期=数据内最早日期~最晚日期。
工作周报示例：
工作周报（统计周期：YYYY.MM.DD-YYYY.MM.DD）
一、【项目完整名称】
1. 精炼后的工作内容条目
2. 精炼后的工作内容条目

二、【项目完整名称】
1. 精炼后的工作内容条目
2. 精炼后的工作内容条目

[User]
本周工作日报如下：
${dailyDetails}`;
  }

  // 清理 AI 响应中的 think 部分
  function cleanAiResponse(content) {
    if (!content) return content;
    
    // 移除 think 标签及其内容
    content = content.replace(/【think】[\s\S]*?【\/think】/g, '');
    content = content.replace(/\[think\][\s\S]*?\[\/think\]/g, '');
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
    
    // 移除单独的 think 行
    content = content.replace(/^think[\s\S]*?$/gm, '');
    
    // 移除多余空行
    content = content.replace(/\n{3,}/g, '\n\n');
    content = content.trim();
    
    return content;
  }

  // 调用 AI 生成总结（流式输出）
  async function generateAiSummary() {
    if (!currentData || currentData.length === 0) {
      setStatus('请先获取日报数据', 'error');
      return;
    }

    aiSummaryBtn.disabled = true;
    aiSummaryBtn.textContent = '生成中...';
    aiSummaryContainer.classList.remove('hidden');
    aiSummaryOutput.textContent = '';
    aiSummaryOutput.innerHTML = '<div class="loading-text">正在生成总结...</div>';
    currentAiSummary = '';

    // Markdown 区域自动折叠
    markdownContainer.classList.add('collapsed');
    markdownOutput.classList.add('hidden');
    markdownToggle.querySelector('span').textContent = 'Markdown 格式 ▶';

    try {
      const prompt = generateAiPrompt(currentData, {
        start: currentData[0].date,
        end: currentData[currentData.length - 1].date
      });

      const response = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_CONFIG.apiKey}`
        },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      aiSummaryOutput.innerHTML = '';
      const summaryElement = document.createElement('pre');
      summaryElement.className = 'ai-summary-text';
      aiSummaryOutput.appendChild(summaryElement);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              const content = data.choices?.[0]?.delta?.content || '';
              if (content) {
                currentAiSummary += content;
                // 实时清理 think 部分并显示
                const cleanedContent = cleanAiResponse(currentAiSummary);
                summaryElement.textContent = cleanedContent;
                aiSummaryOutput.scrollTop = aiSummaryOutput.scrollHeight;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      setStatus('AI 总结生成成功！', 'success');
    } catch (error) {
      console.error('AI 总结生成失败:', error);
      aiSummaryOutput.innerHTML = `<div class="error-text">生成失败：${error.message}</div>`;
      setStatus('AI 总结生成失败', 'error');
    } finally {
      aiSummaryBtn.disabled = false;
      aiSummaryBtn.textContent = 'AI 总结';
    }
  }

  // 设置状态显示
  function setStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  // 显示错误
  function showError(message) {
    errorContainer.classList.remove('hidden');
    errorMessage.textContent = message;
  }

  // 隐藏错误
  function hideError() {
    errorContainer.classList.add('hidden');
  }

  // 生成 Markdown 格式
  function generateMarkdown(data, weekRange) {
    if (!data || data.length === 0) {
      return '本周暂无日报数据';
    }

    const lines = [];
    lines.push(`# 本周日报汇总`);
    lines.push(``);
    lines.push(`**时间范围**: ${weekRange.start} ~ ${weekRange.end}`);
    lines.push(``);
    lines.push(`| 日期 | 项目名称 | 工时 | 工作内容 |`);
    lines.push(`| --- | --- | --- | --- |`);

    for (const item of data) {
      // 转义工作内容中的换行和管道符
      const workContent = (item.workContent || '')
        .replace(/\n/g, '；')
        .replace(/\|/g, '\\|');
      lines.push(`| ${item.date} | ${item.projectName} | ${item.useHour}h | ${workContent} |`);
    }

    return lines.join('\n');
  }

  // 显示结果
  function showResult(data, weekRange) {
    currentData = data;
    currentMarkdown = generateMarkdown(data, weekRange);
    currentAiSummary = null;

    // Markdown 默认展开显示
    markdownContainer.classList.remove('hidden');
    markdownContainer.classList.remove('collapsed');
    markdownOutput.classList.remove('hidden');
    markdownOutput.textContent = currentMarkdown;
    markdownToggle.querySelector('span').textContent = 'Markdown 格式 ▼';

    // JSON 默认折叠
    resultContainer.classList.remove('hidden');
    resultContainer.classList.add('collapsed');
    jsonOutput.classList.add('hidden');
    jsonToggle.querySelector('span').textContent = 'JSON 数据 ▶';

    // AI 总结区域隐藏
    aiSummaryContainer.classList.add('hidden');

    weekRangeEl.textContent = `日期范围：${weekRange.start} ~ ${weekRange.end}`;
    weekRangeEl.classList.remove('hidden');
  }

  // 隐藏结果
  function hideResult() {
    resultContainer.classList.add('hidden');
    markdownContainer.classList.add('hidden');
    aiSummaryContainer.classList.add('hidden');
    currentData = null;
    currentMarkdown = null;
    currentAiSummary = null;
  }

  // 切换 JSON 显示
  function toggleJson() {
    const isCollapsed = resultContainer.classList.contains('collapsed');
    if (isCollapsed) {
      resultContainer.classList.remove('collapsed');
      jsonOutput.classList.remove('hidden');
      jsonOutput.textContent = JSON.stringify(currentData, null, 2);
      jsonToggle.querySelector('span').textContent = 'JSON 数据 ▼';
    } else {
      resultContainer.classList.add('collapsed');
      jsonOutput.classList.add('hidden');
      jsonToggle.querySelector('span').textContent = 'JSON 数据 ▶';
    }
  }

  // 切换 Markdown 显示
  function toggleMarkdown() {
    const isCollapsed = markdownContainer.classList.contains('collapsed');
    if (isCollapsed) {
      markdownContainer.classList.remove('collapsed');
      markdownOutput.classList.remove('hidden');
      markdownOutput.textContent = currentMarkdown;
      markdownToggle.querySelector('span').textContent = 'Markdown 格式 ▼';
    } else {
      markdownContainer.classList.add('collapsed');
      markdownOutput.classList.add('hidden');
      markdownToggle.querySelector('span').textContent = 'Markdown 格式 ▶';
    }
  }

  // 获取数据
  async function fetchData() {
    setStatus('正在获取数据...', 'loading');
    hideError();
    hideResult();
    fetchBtn.disabled = true;

    try {
      // 检查是否在目标网站上
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url.startsWith('https://gs.capinfo.com.cn')) {
        setStatus('获取失败', 'error');
        showError('请先访问 https://gs.capinfo.com.cn 并确保已登录');
        fetchBtn.disabled = false;
        return;
      }

      // 先尝试直接向 content script 发送消息
      let response = null;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'getWeeklyData' });
      } catch (e) {
        // 如果 content script 没有响应，尝试注入 content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // 再次尝试发送消息
        response = await chrome.tabs.sendMessage(tab.id, { action: 'getWeeklyData' });
      }

      if (response && response.success) {
        setStatus('获取成功！', 'success');
        // 如果解析结果为空，显示原始响应便于调试
        if (response.data && response.data.length === 0 && response.rawResponse) {
          showResult({ 
            message: '解析结果为空，原始响应如下：',
            rawResponse: response.rawResponse 
          }, response.weekRange);
        } else {
          showResult(response.data, response.weekRange);
        }
      } else {
        setStatus('获取失败', 'error');
        showError(response?.error || '未知错误');
      }
    } catch (error) {
      setStatus('获取失败', 'error');
      showError(error.message || '网络错误，请确保已登录并刷新页面');
    } finally {
      fetchBtn.disabled = false;
    }
  }

  // 复制 JSON 到剪贴板
  async function copyToClipboard() {
    if (!currentData) return;
    await copyText(JSON.stringify(currentData, null, 2), copyBtn);
  }

  // 复制 Markdown 到剪贴板
  async function copyMarkdownToClipboard() {
    if (!currentMarkdown) return;
    await copyText(currentMarkdown, copyMdBtn);
  }

  // 复制 AI 总结到剪贴板
  async function copyAiToClipboard() {
    if (!currentAiSummary) return;
    // 复制时也要清理 think 部分
    const cleanedContent = cleanAiResponse(currentAiSummary);
    await copyText(cleanedContent, copyAiBtn);
  }

  // 通用复制函数
  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '已复制!';
      setTimeout(() => {
        btn.textContent = '复制';
      }, 2000);
    } catch (error) {
      // 降级方案：使用 textarea
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      btn.textContent = '已复制!';
      setTimeout(() => {
        btn.textContent = '复制';
      }, 2000);
    }
  }

  // 绑定事件
  fetchBtn.addEventListener('click', fetchData);
  copyBtn.addEventListener('click', copyToClipboard);
  copyMdBtn.addEventListener('click', copyMarkdownToClipboard);
  copyAiBtn.addEventListener('click', copyAiToClipboard);
  aiSummaryBtn.addEventListener('click', generateAiSummary);
  jsonToggle.addEventListener('click', toggleJson);
  markdownToggle.addEventListener('click', toggleMarkdown);
});

document.addEventListener('DOMContentLoaded', async () => {
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
  const configBtn = document.getElementById('configBtn');
  const configPanel = document.getElementById('configPanel');
  const closeConfigBtn = document.getElementById('closeConfigBtn');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const apiBaseUrlInput = document.getElementById('apiBaseUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const modelNameInput = document.getElementById('modelName');

  let currentData = null;
  let currentMarkdown = null;
  let currentAiSummary = null;

  const DEFAULT_AI_CONFIG = {
    baseUrl: 'https://ai.gitee.com/v1',
    apiKey: '',
    model: 'Qwen3-8B'
  };

  let AI_CONFIG = { ...DEFAULT_AI_CONFIG };

  async function loadAiConfig() {
    try {
      const result = await chrome.storage.local.get('aiConfig');
      if (result.aiConfig) {
        AI_CONFIG = { ...DEFAULT_AI_CONFIG, ...result.aiConfig };
      }
    } catch (error) {
      console.error('加载 AI 配置失败:', error);
    }
  }

  async function saveAiConfig(config) {
    try {
      AI_CONFIG = { ...AI_CONFIG, ...config };
      await chrome.storage.local.set({ aiConfig: AI_CONFIG });
    } catch (error) {
      console.error('保存 AI 配置失败:', error);
    }
  }

  function updateConfigForm() {
    apiBaseUrlInput.value = AI_CONFIG.baseUrl;
    apiKeyInput.value = AI_CONFIG.apiKey;
    modelNameInput.value = AI_CONFIG.model;
  }

  function toggleConfigPanel() {
    if (configPanel) {
      configPanel.classList.toggle('hidden');
    }
  }

  async function handleSaveConfig() {
    const newConfig = {
      baseUrl: apiBaseUrlInput.value || DEFAULT_AI_CONFIG.baseUrl,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value || DEFAULT_AI_CONFIG.model
    };
    await saveAiConfig(newConfig);
    setStatus('配置已保存', 'success');
    setTimeout(() => {
      setStatus('准备就绪', 'info');
    }, 2000);
    toggleConfigPanel();
  }

  await loadAiConfig();
  updateConfigForm();

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

  function cleanAiResponse(content) {
    if (!content) return content;
    
    let result = content;
    
    result = result.replace(/【think】[\s\S]*?【\/think】/g, '');
    result = result.replace(/\[think\][\s\S]*?\[\/think\]/g, '');
    result = result.replace(/<tool_call>[\s\S]*?<\/think>/g, '');
    
    const thinkPatterns = ['【think】', '[think]', '<think>'];
    for (const pattern of thinkPatterns) {
      const startIndex = result.lastIndexOf(pattern);
      if (startIndex !== -1) {
        let closeTag;
        if (pattern === '【think】') closeTag = '【/think】';
        else if (pattern === '[think]') closeTag = '[/think]';
        else closeTag = '</think>';
        
        const closeIndex = result.lastIndexOf(closeTag);
        if (closeIndex === -1 || closeIndex < startIndex) {
          result = result.substring(0, startIndex);
        }
      }
    }
    
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.trim();
    
    return result;
  }

  async function generateAiSummary() {
    if (!currentData || currentData.length === 0) {
      setStatus('请先获取日报数据', 'error');
      return;
    }

    if (!AI_CONFIG.apiKey) {
      setStatus('请先配置 AI API Key', 'error');
      configPanel.classList.remove('hidden');
      apiKeyInput.focus();
      return;
    }

    aiSummaryBtn.disabled = true;
    aiSummaryBtn.textContent = '生成中...';
    aiSummaryContainer.classList.remove('hidden');
    aiSummaryOutput.textContent = '';
    aiSummaryOutput.innerHTML = '<div class="loading-text">正在生成总结...</div>';
    currentAiSummary = '';

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
              content: prompt + '\n\n注意：请直接输出最终结果，不要输出思考过程或使用<think>标签。'
            }
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 2000,
          enable_thinking: false
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
                const cleanedContent = cleanAiResponse(currentAiSummary);
                summaryElement.textContent = cleanedContent;
                aiSummaryOutput.scrollTop = aiSummaryOutput.scrollHeight;
              }
            } catch (e) {
            }
          }
        }
      }

      const finalCleanedContent = cleanAiResponse(currentAiSummary);
      summaryElement.textContent = finalCleanedContent;
      currentAiSummary = finalCleanedContent;

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

  function setStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  function showError(message) {
    errorContainer.classList.remove('hidden');
    errorMessage.textContent = message;
  }

  function hideError() {
    errorContainer.classList.add('hidden');
  }

  function escapeMarkdownTable(text) {
    if (!text) return '';
    return String(text)
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '；')
      .replace(/\r/g, '');
  }

  function generateMarkdown(data, weekRange) {
    if (!data || data.length === 0) {
      return '本周暂无日报数据';
    }

    const header = [
      '# 本周日报汇总',
      '',
      `**时间范围**: ${weekRange.start} ~ ${weekRange.end}`,
      '',
      '| 日期 | 项目名称 | 工时 | 工作内容 |',
      '| --- | --- | --- | --- |'
    ];

    const rows = data.map(item => {
      const workContent = escapeMarkdownTable(item.workContent);
      return `| ${item.date} | ${item.projectName || '-'} | ${item.useHour || 0}h | ${workContent} |`;
    });

    return [...header, ...rows].join('\n');
  }

  function showResult(data, weekRange, message = null) {
    currentData = data;
    currentMarkdown = generateMarkdown(data, weekRange);
    currentAiSummary = null;

    if (message) {
      markdownContainer.classList.remove('hidden');
      markdownContainer.classList.remove('collapsed');
      markdownOutput.classList.remove('hidden');
      markdownOutput.innerHTML = `<div class="empty-message">${message}</div>`;
      markdownToggle.querySelector('span').textContent = 'Markdown 格式 ▼';
    } else {
      markdownContainer.classList.remove('hidden');
      markdownContainer.classList.remove('collapsed');
      markdownOutput.classList.remove('hidden');
      markdownOutput.textContent = currentMarkdown;
      markdownToggle.querySelector('span').textContent = 'Markdown 格式 ▼';
    }

    resultContainer.classList.remove('hidden');
    resultContainer.classList.add('collapsed');
    jsonOutput.classList.add('hidden');
    jsonToggle.querySelector('span').textContent = 'JSON 数据 ▶';

    aiSummaryContainer.classList.add('hidden');

    weekRangeEl.textContent = `日期范围：${weekRange.start} ~ ${weekRange.end}`;
    weekRangeEl.classList.remove('hidden');
  }

  function hideResult() {
    resultContainer.classList.add('hidden');
    markdownContainer.classList.add('hidden');
    aiSummaryContainer.classList.add('hidden');
    currentData = null;
    currentMarkdown = null;
    currentAiSummary = null;
  }

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

  async function fetchData() {
    setStatus('正在获取数据...', 'loading');
    hideError();
    hideResult();
    fetchBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url.startsWith('https://gs.capinfo.com.cn')) {
        setStatus('获取失败', 'error');
        showError('请先访问 https://gs.capinfo.com.cn 并确保已登录');
        fetchBtn.disabled = false;
        return;
      }

      let response = null;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'getWeeklyData' });
      } catch (e) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        response = await chrome.tabs.sendMessage(tab.id, { action: 'getWeeklyData' });
      }

      if (response && response.success) {
        setStatus('获取成功！', 'success');
        showResult(response.data, response.weekRange, response.message);
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

  async function copyToClipboard() {
    if (!currentData) return;
    await copyText(JSON.stringify(currentData, null, 2), copyBtn);
  }

  async function copyMarkdownToClipboard() {
    if (!currentMarkdown) return;
    await copyText(currentMarkdown, copyMdBtn);
  }

  async function copyAiToClipboard() {
    if (!currentAiSummary) return;
    await copyText(currentAiSummary, copyAiBtn);
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      showCopySuccess(btn);
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showCopySuccess(btn);
    }
  }

  function showCopySuccess(btn) {
    btn.textContent = '✓ 已复制';
    btn.classList.add('copied');
    setStatus('复制成功！', 'success');
    setTimeout(() => {
      btn.textContent = '复制';
      btn.classList.remove('copied');
      if (statusEl.textContent === '复制成功！') {
        setStatus('准备就绪', 'info');
      }
    }, 2000);
  }

  fetchBtn.addEventListener('click', fetchData);
  copyBtn.addEventListener('click', copyToClipboard);
  copyMdBtn.addEventListener('click', copyMarkdownToClipboard);
  copyAiBtn.addEventListener('click', copyAiToClipboard);
  aiSummaryBtn.addEventListener('click', generateAiSummary);
  jsonToggle.addEventListener('click', toggleJson);
  markdownToggle.addEventListener('click', toggleMarkdown);
  configBtn.addEventListener('click', toggleConfigPanel);
  closeConfigBtn.addEventListener('click', toggleConfigPanel);
  saveConfigBtn.addEventListener('click', handleSaveConfig);
});
# 提示词动态配置接口实现方案

## 一、需求分析

### 1.1 业务背景
当前插件中的提示词采用硬编码方式写死在 `sidebar.js` 中，用户希望能够：
- 动态管理提示词内容
- 从本地数据库/存储中获取提示词
- 支持提示词的增删改查操作
- 保持类似MCP的实现逻辑

### 1.2 功能需求
| 需求点 | 描述 | 优先级 |
|--------|------|--------|
| 提示词存储 | 使用Chrome本地存储持久化提示词数据 | 高 |
| 配置界面 | 在插件侧边栏中添加提示词管理面板 | 高 |
| CRUD操作 | 支持提示词的增、删、改、查 | 高 |
| 默认提示词 | 首次使用时自动初始化默认提示词 | 中 |
| 提示词选择 | 在生成周报时选择使用哪个提示词 | 高 |
| 模板变量 | 支持在提示词中使用占位符变量 | 中 |

## 二、技术方案

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     浏览器插件 Sidebar                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │  主界面     │  │ 配置面板    │  │ 提示词管理面板    │   │
│  │ (获取日报)  │  │ (API配置)   │  │ (提示词CRUD)      │   │
│  └──────┬──────┘  └──────┬──────┘  └─────────┬─────────┘   │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │              PromptManager (提示词管理器)              │   │
│  │  - loadPrompts()     - savePrompt()      - getPrompt()│   │
│  │  - addPrompt()       - deletePrompt()    - listPrompts()│  │
│  └───────────────────────────┬───────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│                    chrome.storage.local                     │
│                    (本地持久化存储)                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据结构设计

```javascript
// 提示词数据结构
{
  id: string,           // 唯一标识（UUID）
  title: string,        // 提示词名称
  content: string,      // 提示词内容
  systemPrompt: string, // 系统提示词部分
  userPrompt: string,   // 用户提示词部分
  variables: array,     // 支持的变量列表
  createdAt: number,    // 创建时间戳
  updatedAt: number     // 更新时间戳
}

// 存储结构
{
  prompts: [Prompt],    // 提示词数组
  activePromptId: string // 当前激活的提示词ID
}
```

### 2.3 文件修改清单

| 文件 | 修改类型 | 描述 |
|------|----------|------|
| `sidebar.js` | 修改 | 添加提示词管理逻辑和UI |
| `sidebar.html` | 修改 | 添加提示词管理面板UI |
| `styles.css` | 修改 | 添加提示词管理面板样式 |
| `background.js` | 修改 | 添加提示词初始化逻辑 |

## 三、实现步骤

### 3.1 步骤一：创建提示词管理器类

在 `sidebar.js` 中添加提示词管理模块：

```javascript
// 提示词管理器类
class PromptManager {
  constructor() {
    this.prompts = [];
    this.activePromptId = null;
  }

  async init() {
    await this.loadPrompts();
    if (this.prompts.length === 0) {
      await this.initDefaultPrompts();
    }
  }

  async loadPrompts() {
    const result = await chrome.storage.local.get(['prompts', 'activePromptId']);
    this.prompts = result.prompts || [];
    this.activePromptId = result.activePromptId || null;
  }

  async savePrompts() {
    await chrome.storage.local.set({
      prompts: this.prompts,
      activePromptId: this.activePromptId
    });
  }

  async addPrompt(prompt) {
    const newPrompt = {
      ...prompt,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.prompts.push(newPrompt);
    await this.savePrompts();
    return newPrompt;
  }

  async updatePrompt(id, updates) {
    const index = this.prompts.findIndex(p => p.id === id);
    if (index !== -1) {
      this.prompts[index] = {
        ...this.prompts[index],
        ...updates,
        updatedAt: Date.now()
      };
      await this.savePrompts();
      return this.prompts[index];
    }
    return null;
  }

  async deletePrompt(id) {
    const index = this.prompts.findIndex(p => p.id === id);
    if (index !== -1) {
      const deleted = this.prompts.splice(index, 1)[0];
      if (this.activePromptId === id) {
        this.activePromptId = this.prompts.length > 0 ? this.prompts[0].id : null;
      }
      await this.savePrompts();
      return deleted;
    }
    return null;
  }

  getPrompt(id) {
    return this.prompts.find(p => p.id === id);
  }

  getActivePrompt() {
    if (!this.activePromptId) return null;
    return this.prompts.find(p => p.id === this.activePromptId);
  }

  async setActivePrompt(id) {
    const prompt = this.getPrompt(id);
    if (prompt) {
      this.activePromptId = id;
      await this.savePrompts();
      return true;
    }
    return false;
  }

  listPrompts() {
    return [...this.prompts];
  }

  async initDefaultPrompts() {
    const defaultPrompts = [
      {
        title: '周报汇总',
        content: '【系统提示词】\n角色：专业周报整理助理...\n\n【用户提示词】\n本周工作日报如下：\n{{日报详情}}',
        systemPrompt: '角色：专业周报整理助理，根据用户提供的工作日报信息，按照固定格式生成项目制工作周报。...',
        userPrompt: '本周工作日报如下：\n{{日报详情}}',
        variables: ['日报详情']
      }
    ];
    
    for (const prompt of defaultPrompts) {
      await this.addPrompt(prompt);
    }
    
    if (this.prompts.length > 0) {
      this.activePromptId = this.prompts[0].id;
      await this.savePrompts();
    }
  }

  renderPrompt(promptId, data) {
    const prompt = this.getPrompt(promptId) || this.getActivePrompt();
    if (!prompt) return '';
    
    let result = prompt.content;
    // 替换变量
    for (const key of Object.keys(data)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
    }
    return result;
  }
}
```

### 3.2 步骤二：添加提示词管理UI

在 `sidebar.html` 中添加提示词管理面板：

```html
<!-- 提示词管理面板 -->
<div id="promptPanel" class="panel hidden">
  <div class="panel-header">
    <h3>提示词管理</h3>
    <button id="closePromptBtn" class="close-btn">×</button>
  </div>
  <div class="panel-body">
    <!-- 提示词列表 -->
    <div id="promptList" class="prompt-list">
      <!-- 动态生成 -->
    </div>
    
    <!-- 添加/编辑表单 -->
    <form id="promptForm" class="prompt-form">
      <input type="hidden" id="promptId">
      <input type="text" id="promptTitle" placeholder="提示词名称" required>
      <textarea id="promptContent" placeholder="提示词内容" rows="6"></textarea>
      <div class="form-actions">
        <button type="button" id="cancelPromptBtn">取消</button>
        <button type="submit">保存</button>
      </div>
    </form>
    
    <button id="addPromptBtn" class="add-btn">+ 添加新提示词</button>
  </div>
</div>
```

### 3.3 步骤三：添加样式

在 `styles.css` 中添加提示词管理面板样式：

```css
.prompt-list {
  margin-bottom: 16px;
  max-height: 200px;
  overflow-y: auto;
}

.prompt-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 4px;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.prompt-item:hover {
  background: #e0e0e0;
}

.prompt-item.active {
  background: #e6f7ff;
  border-left: 3px solid #1890ff;
}

.prompt-item .actions {
  display: none;
}

.prompt-item:hover .actions {
  display: flex;
  gap: 4px;
}

.prompt-item button {
  padding: 2px 6px;
  font-size: 12px;
}

.prompt-form textarea {
  width: 100%;
  resize: vertical;
}

.add-btn {
  width: 100%;
  padding: 8px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.add-btn:hover {
  background: #40a9ff;
}
```

### 3.4 步骤四：集成到现有逻辑

在 `sidebar.js` 中修改 `generateAiPrompt` 函数使用动态提示词：

```javascript
const promptManager = new PromptManager();

// 初始化
await promptManager.init();

// 修改生成提示词的函数
function generateAiPrompt(dailyData, weekRange) {
  const dailyDetails = dailyData.map(item => {
    return `日期：${item.date}\n项目名称：${item.projectName}\n工作内容：${item.workContent}\n`;
  }).join('\n');

  // 使用提示词管理器渲染提示词
  const renderedPrompt = promptManager.renderPrompt(null, {
    '日报详情': dailyDetails,
    '统计周期': weekRange,
    '日期范围': weekRange
  });

  return renderedPrompt || `【系统提示词】
角色：专业周报整理助理...
【用户提示词】
本周工作日报如下：
${dailyDetails}`;
}
```

## 四、风险评估

| 风险点 | 描述 | 解决方案 |
|--------|------|----------|
| 存储容量限制 | Chrome本地存储有5MB限制 | 提示词内容通常较小，5MB可存储大量提示词；可考虑压缩存储 |
| 数据迁移 | 升级时需要迁移旧配置 | 在init时检测并迁移旧数据格式 |
| 兼容性 | 不同Chrome版本API支持差异 | 使用标准API，添加错误处理 |
| 性能 | 大量提示词时列表渲染性能 | 实现虚拟滚动或分页加载 |

## 五、依赖与兼容性

### 5.1 依赖清单
- Chrome Extension Manifest V3
- Chrome Storage API
- crypto.randomUUID() (Chrome 90+)

### 5.2 浏览器兼容性
- Chrome 90+ (支持 crypto.randomUUID)
- Edge 90+
- 其他Chromium内核浏览器

## 六、测试计划

### 6.1 功能测试
| 测试项 | 描述 | 预期结果 |
|--------|------|----------|
| 首次安装 | 插件首次安装时自动创建默认提示词 | 默认提示词存在 |
| 添加提示词 | 点击添加按钮，填写表单保存 | 提示词列表增加新项 |
| 编辑提示词 | 点击编辑按钮修改内容 | 内容更新成功 |
| 删除提示词 | 点击删除按钮 | 提示词从列表中移除 |
| 选择提示词 | 点击列表项设置为激活 | 激活状态切换 |
| 使用提示词 | 获取日报后生成周报 | 使用选中的提示词 |

### 6.2 边界测试
| 测试项 | 描述 | 预期结果 |
|--------|------|----------|
| 空提示词 | 内容为空时保存 | 提示错误，不允许保存 |
| 变量替换 | 提示词中包含未定义变量 | 使用空字符串替换 |
| 删除全部 | 删除所有提示词 | 自动重置为默认提示词 |

---

**文档版本**: v1.0  
**创建时间**: 2026-06-17  
**状态**: 待审批
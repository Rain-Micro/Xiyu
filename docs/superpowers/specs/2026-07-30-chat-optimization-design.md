# 聊天界面优化 + 收藏系统 + 用户模块重构 · 设计文档

## 1. 模型展示区优化（左栏）— 已完成

**状态：✅ 已实现**

- 窗口大小变化时，ResizeObserver 监听容器尺寸变化，重新计算模型展示尺寸
- 同步更新 PixiJS 渲染器视口大小（`renderer.resize()`）
- 模型保持宽高比，适配容器尺寸变化，确保画面清晰不模糊
- 左栏与右栏之间增加可拖动分隔线，支持 `col-resize` 光标拖拽
- 左栏宽度范围：最小 150px，最大窗口宽度的 70%

---

## 2. 右键消息菜单

### 2.1 功能需求

用户可在聊天消息列表中，右键点击任意消息（自己发的或对方发的），弹出操作菜单。

**自己发送的消息（右键菜单）：**
- 复制：复制消息内容到剪贴板
- 修改：在原消息位置弹出编辑框，修改后更新
- 删除：删除该消息（从 UI 和 IndexedDB 中移除）
- 撤回：撤回该消息，消息显示为"已撤回"状态（保留占位，内容替换）
- 转发：转发给其他角色（弹出角色选择列表）
- 收藏：将消息内容添加到收藏夹

**对方发送的消息（右键菜单）：**
- 复制：复制消息内容到剪贴板
- 转发：转发给其他角色
- 收藏：将消息内容添加到收藏夹
- 让对方重新回复：重新触发一次模拟回复

### 2.2 技术设计

**组件：** `MessageContextMenu`
- 浮层菜单，绝对定位，出现在鼠标点击位置附近
- 菜单项之间用分割线（`<hr />`）区分
- 点击菜单项后菜单自动关闭
- 点击菜单外部区域菜单自动关闭（监听 document click）

**状态管理：**
- 使用局部 state 管理菜单显隐和位置：`{ visible: boolean, x: number, y: number, message: Message | null }`
- 区分菜单类型（own / other）基于 `message.role`

**交互细节：**
- 右键点击消息气泡时触发 `onContextMenu` 事件
- 阻止默认浏览器右键菜单：`e.preventDefault()`
- 菜单位置：基于鼠标点击坐标计算，边界检测避免超出视口

**修改消息流程：**
- 点击"修改"后，在原消息位置替换为可编辑的 `<textarea>`
- 失去焦点或按 Enter 时保存，按 Escape 取消
- 更新消息内容后同步更新 IndexedDB

**撤回消息流程：**
- 点击"撤回"后，消息内容替换为"已撤回"
- 保留消息占位，但不可再操作（或仅允许删除）
- 添加 `isWithdrawn` 标记到 Message 类型（可选方案）或直接将内容替换为"已撤回"

**重新回复流程：**
- 调用 `sendMessage` 但不添加用户消息，直接触发角色回复逻辑
- 或新增 `regenerateReply(characterId)` 方法到 chatStore

**转发流程：**
- 弹出角色选择列表（复用 CharacterContactList 组件或简化版）
- 选择角色后，将该消息内容作为新消息发送给目标角色

---

## 3. 收藏系统

### 3.1 数据模型

```typescript
// 新增类型到 types/index.ts
export interface Favorite {
  id: string                    // 唯一 ID
  type: 'text' | 'image' | 'file' | 'voice' | 'link'  // 收藏内容类型
  content: string               // 文本内容 / 文件 URL / 图片描述
  fileInfo?: {                  // 文件信息（图片/文件类型时）
    name: string
    url: string
    thumbnailUrl?: string
    size?: number
  }
  voiceInfo?: {                 // 语音信息（语音类型时）
    url: string
    duration: number
  }
  sourceRole: string            // 来源角色名称
  sourceCharacterId?: string    // 来源角色 ID
  createdAt: number             // 收藏时间
  isPinned: boolean             // 是否置顶
}
```

### 3.2 存储方案

**IndexedDB 表：**
- 表名：`favorites`
- 索引：`id`（主键）, `type`, `createdAt`, `isPinned`
- 初始化：在 `db.ts` 的 `DigitalHumanDB` 类中添加 `favorites` 表
- 版本升级：从 version 1 升级到 version 2

### 3.3 聊天界面收藏入口

**礼物盒按钮：**
- 位置：输入框右侧按钮组，在"图片按钮"的右侧
- 图标：`Gift`（lucide-react）
- 点击后弹出"我的收藏"面板（底部弹窗或侧边抽屉）

**收藏面板：**
- 展示收藏的列表（文本、图片缩略图、文件图标）
- 点击收藏项自动发送到当前聊天
- 支持按类型筛选（全部、文字、图片、文件等）

### 3.4 收藏管理页面

**路由：** `/user-module/favorites` 或作为用户模块子页面

**页面结构：**
- 顶部搜索输入框（按内容搜索）
- 分类标签栏：全部、日期、文件、图片、视频、表情包、语音、链接
- 收藏列表：卡片式布局，展示内容预览、来源角色、收藏时间
- 每个收藏项操作：删除、置顶、复制
- 批量选择模式：复选框 + 顶部批量操作栏（批量删除）

**交互：**
- 置顶操作：将收藏项 `isPinned` 设为 true，排序时置顶项优先
- 删除操作：从 IndexedDB 删除，同步更新列表
- 复制操作：复制内容到剪贴板

---

## 4. 用户模块重构

### 4.1 页面结构

点击顶部"用户"图标进入用户模块页面（新页面）。

**路由：** `/user-module`

**三个入口（从上到下）：**
1. **个人信息**：点击后跳转到 `/profile`（现有功能不变）
2. **收藏设置**：点击后跳转到收藏管理页面 `/user-module/favorites`
3. **用户偏好设置**：将现有设置面板中的"用户偏好"模块迁移到此处

### 4.2 个人信息返回逻辑修复

**问题：** 从个人信息界面点击左箭头返回时，当前跳转到 `/main`。

**修复：** 修改为返回到 `/user-module`。

**实现方式：**
- 在 `UserProfilePage.tsx` 中，将返回按钮的 `navigate('/main')` 改为 `navigate('/user-module')`
- 添加 `from` state 支持：如果从用户模块进入，则返回用户模块；否则返回主界面

### 4.3 用户偏好设置迁移

**从 `SettingsPanel.tsx` 的 "preference" tab 迁移以下内容：**
- 开机自启开关
- 桌面通知开关
- 健康提醒开关
- 创建角色后自动跳转聊天界面开关
- 消息气泡透明度滑块
- 权限管理（麦克风、文件读取）
- 一键恢复默认设置按钮

**新页面：** `UserPreferencesPage.tsx`

**SettingsPanel 调整：**
- 移除 "preference" tab
- 保留 "basic"、"save"、"about" tabs

---

## 5. 输入框按钮布局

**从左到右顺序（4 个按钮）：**

| 顺序 | 按钮 | 功能 | 图标 |
|------|------|------|------|
| 1 | 语音 | 语音输入 | Mic |
| 2 | 表情包 | 表情/贴纸面板 | Smile |
| 3 | 工具箱 | 下拉菜单：文件、图片、收藏 | Wrench |
| 4 | 发送 | 发送消息 | Send |

**工具箱下拉菜单说明：**
- 点击"工具箱"按钮弹出下拉菜单
- 包含三个选项：文件（发送文件）、图片（发送图片）、收藏（打开收藏面板）
- 点击选项后执行对应功能，菜单自动关闭

---

## 6. 撤回消息显示

- 用户点击"撤回"后，该消息内容替换为"已撤回"占位文本
- 消息保留在原位置，不删除
- 显示样式为灰色斜体，区别于普通消息

---

## 6. 路由变更汇总

| 路由 | 说明 |
|------|------|
| `/user-module` | 新增：用户模块主页（三入口） |
| `/user-module/favorites` | 新增：收藏管理页面 |
| `/user-module/preferences` | 新增：用户偏好设置页面 |
| `/profile` | 已有：个人信息（返回逻辑修改） |

**App.tsx 修改：**
- 顶部"用户"图标点击导航从 `/profile` 改为 `/user-module`
- 新增路由注册

---

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types/index.ts` | 修改 | 新增 Favorite 类型 |
| `src/services/db.ts` | 修改 | 新增 favorites 表，升级 DB 版本 |
| `src/stores/chatStore.ts` | 修改 | 新增 updateMessage, withdrawMessage, regenerateReply 方法 |
| `src/pages/ChatPage.tsx` | 修改 | 新增右键菜单、礼物盒按钮、收藏面板集成 |
| `src/pages/UserProfilePage.tsx` | 修改 | 修复返回逻辑 |
| `src/components/SettingsPanel.tsx` | 修改 | 移除 preference tab |
| `src/App.tsx` | 修改 | 新增路由，修改用户图标导航 |
| `src/pages/UserModulePage.tsx` | 新增 | 用户模块主页（三入口） |
| `src/pages/FavoritesPage.tsx` | 新增 | 收藏管理页面 |
| `src/pages/UserPreferencesPage.tsx` | 新增 | 用户偏好设置页面 |
| `src/components/MessageContextMenu.tsx` | 新增 | 右键消息菜单组件 |
| `src/components/FavoritesPanel.tsx` | 新增 | 收藏选择面板（底部弹窗） |
| `src/stores/favoritesStore.ts` | 新增 | 收藏状态管理 |

---

## 8. 验收标准

### 模型区
- [ ] 窗口缩放时模型比例正常，画面清晰
- [ ] 分隔线可拖拽调整左栏宽度

### 右键菜单
- [ ] 自己发的消息右键显示：复制、修改、删除、撤回、转发、收藏
- [ ] 对方发的消息右键显示：复制、转发、收藏、让对方重新回复
- [ ] 菜单浮层出现在鼠标位置附近

### 收藏系统
- [ ] 文字、图片、文件均可收藏
- [ ] 礼物盒按钮可打开收藏面板
- [ ] 选择收藏内容后可发送到聊天
- [ ] 收藏设置页面支持搜索和分类筛选
- [ ] 支持单个删除、置顶、复制
- [ ] 支持批量删除

### 用户模块
- [ ] 用户模块页面包含三个入口：个人信息、收藏设置、用户偏好
- [ ] 个人信息返回时回到用户模块
- [ ] 用户偏好设置已从设置面板迁移

# AGENTS.md — Monthly Expenses 项目 AI 助手指南

> macOS 风格的个人记账系统

---

## 🎯 项目定位

**Monthly Expenses** 是 Sami 给自己用的简易记账系统，macOS Big Sur 风格。
区别于 squirrelinstall / squirrelfinance 等业务系统 — 这是**个人工具**，数据敏感性低，但跨设备同步需要。

---

## 📦 部署架构

```
monthly-expenses/
├── index.html          # 前端单文件 SPA (Vue 3 + ECharts CDN)
├── Code.gs             # GAS 后端 (用户复制到 GAS 编辑器)
├── gas/
│   ├── Code.gs         # GAS 后端 (开发源, 跟根目录同步)
│   └── appsscript.json
├── dist/               # 前端开发目录 (跟根目录 index.html 同步)
├── docs/
│   └── DEPLOY.md       # 部署文档
├── README.md
└── AGENTS.md           # 本文件
```

**部署地址**:
- 前端: https://ongsami-create.github.io/Monthly-Expenses/
- 后端 GAS: `MonthlyExpenses` 项目
  - Web App URL: `https://script.google.com/macros/s/AKfycbz_TFplnykqcvhgdO7L8HsjDUgGr5jMrNv8Y8RF2cAo7njZFJhbe6QpxNWU3R9De0_LtQ/exec`
  - Version: 1.5.0 (2026-09-20 RMB 流水)

**关键路径**:
- 本地源: `C:\Users\sami_\.minimax-agent-cn\projects\33\monthly-expenses\`
- GitHub: `https://github.com/ongsami-create/Monthly-Expenses`
- PAT: 见 Mavis User Memory, 不进 git

---

## 🔧 技术细节

### 前端 (index.html, ~65KB)

- **框架**: Vue 3.4.21 (CDN, global prod)
- **图表**: ECharts 5.4.3 (CDN)
- **存储**: localStorage 缓存 (key: `me_*`), 主数据在 GAS
- **缓存策略**:
  - `me_current_month` 当前月份
  - `me_active_tab` 当前 Tab
  - `me_cached_categories` 类别缓存
  - `me_cached_transactions_<YYYY-MM>` 月度交易缓存

### 后端 (Code.gs, ~16KB)

- **存储**: PropertiesService (无 scope, 永久)
- **数据结构**:
  - `me_categories` → 类别数组
  - `me_tx_<YYYY-MM>` → 月度交易数组
  - `me_tx_index` → 月份索引 `['2026-08', '2026-09']`
  - `me_meta` → 元信息
- **缓存**: CacheService (60s TTL)
- **API**:
  - GET: `ping / getCategories / getTransactions / getAllTransactions / getMonthlyStats / getYearlyStats / getDashboard / debug / clearAll`
  - POST: `saveCategories / addTransaction / updateTransaction / deleteTransaction`

### 部署

跟 squirrelinstall / squirrelfinance 一样手动部署:
1. 用户去 GAS 编辑器 → 粘贴 `Code.gs` → 创建 `appsscript.json`
2. 部署 Web App → "任何人" + 新版本
3. 把 URL 替换到 `index.html` 的 `API_BASE` 常量
4. Git push

---

## ⚠️ 反复踩过的坑 (项目级)

### 1. GAS "任何人" 部署必须 "ANYONE_ANONYMOUS" + executeAs "USER_DEPLOYING"

- `appsscript.json`:
  ```json
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
  ```
- 部署时 UI: "具有访问权限的用户" = 任何人 (匿名)
- 必须重新部署 (改 access 不会自动应用到已部署版本)

### 2. PropertiesService 9KB 单 property 限制

- 月度交易按 YYYY-MM 分片, 50 笔/月 ≈ 7.5KB, 安全
- 总 500KB/script, 远够个人记账
- **不要**把全量数据塞一个 property

### 3. 部署后必须 ping 验证

- 部署后等 5-10 秒, GAS 缓存刷新
- 调 `?action=ping` 看 `success: true`
- 调 `?action=ping&nocache=1` 绕过 CacheService 强制实时

### 4. 改完代码要验证

- 前端部署后: `webfetch` URL 带 `?bust=$((Get-Date).Ticks)`
- GAS 部署后: 调对应 action 看返回值
- GitHub Pages 部署 5-11 分钟延迟

### 5. 跨月移动交易 (`updateTransaction`)

- 改交易的 date 跨月时, 要从旧月份删除, 写到新月份
- `updateTxIndex_()` 只加不删, 旧月份索引会留 (无影响, 空月跳过)

### 6. localStorage 缓存可能跟服务器不一致

- 用户可能多设备登录, 一台改了另一台看不到
- 解决: 每次切换月份重新拉, 写入操作成功后更新 localStorage
- 调试: 浏览器 DevTools Application → Local Storage → 清空

### 7. ECharts 实例销毁

- 切换 Tab 时不需要销毁, 隐藏就行
- 但 resize() 要在显示时调用, 不然图表会显示错位
- 已加 window resize 监听

---

## 📝 数据模型

### Category
```js
{
  id: 'cat_xxx',          // 'cat_inc_salary' 或 'cat_' + timestamp
  name: '薪水',
  type: 'income' | 'expense',
  color: '#34C759',       // hex
  icon: '💰'              // emoji
}
```

### Transaction
```js
{
  id: 'tx_xxx',           // 'tx_' + timestamp + '_' + random
  date: '2026-08-15',     // YYYY-MM-DD
  type: 'income' | 'expense',
  categoryId: 'cat_inc_salary',
  amount: 1500.00,        // number, MYR
  description: '8月薪资',  // optional
  createdAt: '2026-08-15T10:30:00.000Z',
  updatedAt: '2026-08-15T10:30:00.000Z'
}
```

---

## 🎨 设计规范

沿用 Squirrel 生态 macOS Big Sur 风格:
- 玻璃顶栏 (`backdrop-filter: saturate(180%) blur(20px)`)
- 圆角 6-14px
- SF Pro 字体
- 主色: macOS Blue #007AFF
- 成功/收入: #34C759
- 警告: #FF9500
- 危险/支出: #FF3B30

**注意**: 这个项目不是 Squirrel 系列, 所以没用 Squirrel 品牌色 (cyan + olive)。
**不**要加 macOS traffic lights (红黄绿圆点)。

---

## 🚧 已知未做 (v1.1 候选)

- ⏸️ 营收导入 (从 squirrelfinance 拉已成交 quote 算利润) — **用户说暂时不做**
- ⏸️ 预算管理 (类别月度预算 + 超支高亮)
- ⏸️ 重复模板 (每月固定项一键复制)
- ⏸️ 智能预测 (基于历史均值预测下月)
- ⏸️ 多账户/钱包
- ⏸️ 多用户/登录
- ⏸️ 标签系统
- ⏸️ 多币种

---

## 🔗 关联项目

- **squirrelinstall** (projects/31) - 下单到安装追踪
- **squirrelfinance** (projects/32) - 财务只读门户
- **squirreldesigner** (projects/29) - 报价系统
- **backadmin** (projects/30) - admin 后台
- **Designerproducts** (projects/27) - 产品库

Monthly Expenses 跟这些系统**没有数据耦合** (用户已确认), 纯独立项目。
未来如果做"营收导入", 才需要调 squirrelfinance 的 GAS API。

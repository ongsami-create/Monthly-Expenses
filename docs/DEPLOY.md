# Deployment Guide

## 1. 部署 GAS 后端

### 1.1 创建 GAS 项目

1. 打开 https://script.google.com → 新建项目
2. 项目名: `MonthlyExpenses` (跟 squirrelinstall 命名风格一致)
3. 默认会创建一个 `Code.gs`

### 1.2 粘贴代码

**注意不要跟其他 GAS 项目搞混** (Squirrel Designer / Squirrel Finance / Squirrel Install 都有 GAS 项目)

1. 删除默认 `Code.gs` 内容
2. 复制本仓库根目录的 `Code.gs` 内容 → 粘贴到 GAS 编辑器
3. 添加 `appsscript.json`:
   - 点齿轮 ⚙️ → "项目设置 (Project settings)"
   - 勾选 "在编辑器中显示 "appsscript.json" 清单文件 (Show 'appsscript.json' manifest file in editor)"
   - 复制本仓库 `gas/appsscript.json` 内容 → 粘贴

### 1.3 部署为 Web App

1. 点右上角 **部署 (Deploy)** → **新建部署 (New deployment)**
2. 类型选择 **Web 应用 (Web app)**
3. 配置:
   - **说明 (Description)**: `v1.0 init`
   - **执行身份 (Execute as)**: **我 (Me)** [squirreldesigner9068@gmail.com]
   - **具有访问权限的用户 (Who has access)**: **任何人 (Anyone)** ⚠️ 必须选这个
4. 点 **部署 (Deploy)**
5. 复制 **Web 应用 URL** (类似 `https://script.google.com/macros/s/AKfycbyx.../exec`)

### 1.4 验证部署

调 ping API:
```powershell
Invoke-RestMethod -Uri "https://script.google.com/macros/s/YOUR_ID/exec?action=ping"
```

应该返回:
```json
{
  "success": true,
  "message": "Monthly Expenses API is running",
  "version": "1.0.0",
  ...
}
```

---

## 2. 配置前端

1. 打开本仓库 `index.html`
2. 找到 `const API_BASE = '...'`  (约第 850 行)
3. 替换为你的 GAS Web App URL
4. 保存

---

## 3. 部署前端 (GitHub Pages)

### 3.1 首次部署 (用户已创建仓库)

```powershell
cd C:\Users\sami_\.minimax-agent-cn\projects\33\monthly-expenses

git add .
git commit -m "v1.0 init"
git push -u origin main
```

### 3.2 启用 GitHub Pages

1. 打开 https://github.com/ongsami-create/Monthly-Expenses/settings/pages
2. **Source**: Deploy from a branch
3. **Branch**: `main` / `(root)`
4. 点 **Save**
5. 等待 5-11 分钟, GitHub Pages 完成部署
6. 访问 https://ongsami-create.github.io/Monthly-Expenses/

### 3.3 验证前端

- 打开 URL, 应该看到 macOS 风格界面
- 首次会自动创建默认类别 (薪水/租金/伙食/...)
- 试着记一笔支出, 看是否能保存并显示

---

## 4. 后续更新

### 4.1 前端更新

```powershell
# 编辑 dist/index.html → 同步到根目录 index.html
Copy-Item dist/index.html ./index.html -Force
git add index.html
git commit -m "v1.1 新增预算功能"
git push
```

等待 5-11 分钟, GitHub Pages 自动重新部署。

### 4.2 GAS 后端更新

1. 改本仓库 `Code.gs` (根目录 + gas/Code.gs 同步)
2. 复制到 GAS 编辑器
3. 部署 → 管理部署 → 编辑 → 版本: **新版本 (New version)** → 部署
4. URL 不变, 前端不需要改

---

## 5. 故障排查

| 症状 | 原因 | 修复 |
|---|---|---|
| 前端打开白屏 | GAS URL 没改 / 部署失败 | 检查 `API_BASE`, 调 ping |
| 调 API 返回 403 | GAS 部署没选"任何人" | 重新部署, 选"任何人" |
| 调 API 返回 "权限不足" | `appsscript.json` 缺失 | 复制本仓库的 appsscript.json |
| 类别保存后丢失 | 前端没等 saveCategories 返回就刷新 | 已在 saveCategory 成功后才更新 localStorage |
| 跨月移动交易失败 | `updateTransaction` 跨月逻辑没生效 | 已在 v1.0.0 实现 |
| GitHub Pages 404 | 没启用 Pages / 还在 build | Settings → Pages → 选 main 分支 |

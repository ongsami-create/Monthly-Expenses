# Monthly Expenses · 简易记账系统

> macOS 风格的个人记账系统 · 类别管理 · 月度营收/支出/盈利 · Top 5 排行

**部署地址**: https://ongsami-create.github.io/Monthly-Expenses/

## 功能

- ✅ 类别管理 (收入/支出, 彩色图标)
- ✅ 交易记录 (CRUD, 按月分组)
- ✅ 月度看板 (营收·支出·盈利 + 趋势图 + 饼图)
- ✅ Top 5 支出排行
- ✅ 年度报表 (12 个月汇总)
- ✅ JSON / CSV 导出
- ✅ 快捷键 (N 新增 / ←→ 切月 / 1-4 切 Tab)
- ✅ macOS Big Sur 玻璃风格

## 技术栈

- **前端**: 单文件 SPA, Vue 3 + ECharts (CDN), 内联 CSS/JS
- **后端**: Google Apps Script Web App
- **存储**: GAS PropertiesService (无 scope, 永久, 单 property 9KB)
- **部署**: GitHub Pages + GAS Web App

## 项目结构

```
monthly-expenses/
├── dist/
│   └── index.html              # 前端单文件 SPA (最终输出)
├── gas/
│   ├── Code.gs                 # GAS 后端
│   └── appsscript.json         # GAS 权限配置
├── docs/
│   └── DEPLOY.md               # 部署文档
├── AGENTS.md                   # 项目 AI 助手指南
└── README.md
```

## 本地开发

```bash
# 直接用浏览器打开 dist/index.html 即可
start dist/index.html
```

## 部署

详见 [docs/DEPLOY.md](docs/DEPLOY.md)

## License

Private - Squirrel Internal Use Only

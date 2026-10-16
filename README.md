# 省钱记

一个给自己用的 iPhone 记账 App（PWA）：**手动添加生活费，余额持续结转，账单按周期统计**。
纯原生 HTML/CSS/JS，无构建步骤、无第三方依赖、无后端；数据只存在你手机本地。

## 功能

- **记一笔**：数字键盘输金额 → 点分类 → 保存，3 秒完成；金额清零、分类保留，方便连记。
- **余额**：生活费到账后可手动添加，支出记账时自动扣除；手动加钱、减钱也会进入流水，余额持续结转。
- **账单**：按设置的每月起始日分期统计；记录页含当前周期分类支出饼图和每日花费，流水可编辑或删除。
- **设置**：添加生活费或减少余额，并设置账单周期起始日（1–31 号，适配发薪日）。
- **分类**：预置 7 个中文分类，可改名、换图标、换颜色、隐藏；也能新增自定义分类。
- **备份**：导出/导入 JSON（下载、复制到剪贴板、文件导入、粘贴导入四种方式），30 天没备份会提醒。
- **离线可用**：Service Worker 缓存全部资源，断网也能打开记账。

## 本地预览

```powershell
# 在项目根目录
python -m http.server 8000 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8000/
```

## 部署到 GitHub Pages

```powershell
gh auth login                                   # 首次：浏览器里完成一次授权
git init -b main                                # 已完成则跳过
git add -A
git commit -m "省钱记 PWA 初版"
gh repo create saving-tracker --public --source . --push

# 开启 Pages（main 分支根目录）
gh api -X POST repos/:owner/saving-tracker/pages -f "source[branch]=main" -f "source[path]=/"
```

等 1-2 分钟，访问 `https://<你的用户名>.github.io/saving-tracker/`。

## 安装到 iPhone

1. 用 **Safari** 打开上面的网址（必须是 Safari，微信/Chrome 里打开无法添加到主屏幕）。
2. 点底部「分享」按钮 → 向下滑找到「**添加到主屏幕**」→ 添加。
3. 从主屏幕图标启动，就是全屏 App；断网也能用。
4. 首次进入去「设置」添加当前余额；之后每次收到生活费，再手动添加到账户余额。

> ⚠️ iOS 上「主屏幕 App」和「Safari 里打开的页面」数据是**两份**，日常固定用主屏幕图标。
> 数据只在本地，清理浏览器数据会丢，建议每月在设置里导出一次备份。

## 目录结构

```
index.html                单页应用骨架（记一笔 / 记录 / 设置）
styles.css                样式（浅色/深色自适应、iPhone 安全区）
app.js                    全部逻辑：状态、渲染、周期计算、导入导出
sw.js                     Service Worker（网络优先 + 缓存兜底）
manifest.webmanifest      PWA 清单
icons/                    图标 + iOS 启动图（脚本生成）
tools/make_icons.py       重新生成图标与启动图
tools/e2e.mjs             端到端自检脚本
```

## 数据格式

存在浏览器 `localStorage` 的 `savetracker.v1`：

```json
{
  "version": 1,
  "settings": {
    "balance": 3000,
    "cycleStartDay": 1,
    "categories": [{ "id": "food", "name": "餐饮", "emoji": "🍚", "color": "#FF9F0A", "builtin": true, "hidden": false }],
    "lastBackupAt": "2026-10-11T12:00:00.000Z"
  },
  "expenses": [
    { "id": "abc123", "amount": 12.5, "catId": "food", "note": "午饭", "date": "2026-10-11", "createdAt": 1760000000000 }
  ]
}
```

## 自检

零依赖，用本机 Edge/Chrome 的 DevTools 协议跑一遍核心流程（117 项断言：键盘规则、账单周期、
编辑删除、导入导出、损坏备份报错、离线可用、深色模式、iPhone 视口布局）。

```powershell
# 1) 起静态服务
python -m http.server 8000 --bind 127.0.0.1

# 2) 起无头浏览器（换成自己的 Edge/Chrome 路径）
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\savetracker-edge" about:blank

# 3) 跑自检
node tools/e2e.mjs http://127.0.0.1:8000/ 9222
```

## 重新生成图标与启动图

```powershell
python tools/make_icons.py
```

脚本会输出各机型启动图的 `<link>` 片段；新增机型时把输出贴进 `index.html` 的 `<head>` 即可。

## 改代码后要刷新缓存

`sw.js` 里的 `CACHE` 常量是缓存版本号。改了 `app.js` / `styles.css` / `index.html` 后，
把它递增（如 `savetracker-v1.0.1`），用户下次打开会提示「已下载新版本 → 刷新」。


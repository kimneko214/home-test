# Personal Dashboard V2

## 已经设置好的内容

教材库链接已经写好：

https://kimneko214.github.io/textbook/

公交默认监控这 3 个 Oakcrossing 一带站点：

- #2407 Oakcrossing at Mapleridge north
- #2408 Oakcrossing at Mapleridge south
- #2409 Oakcrossing Gate at Oakcrossing Rd

它们都可在 `config.js` 中增删。

## 为什么没有把家的完整地址直接写进代码

如果 GitHub 仓库是公开的，把完整家庭地址写进 JS 等于公开地址。

因此 V2 仍然使用浏览器 localStorage：

第一次打开主页 -> 回家 -> 设置 -> 输入你的地址 -> 保存。

之后只在那台设备上保存。

## 部署 1：先部署 Cloudflare Worker

Cloudflare Dashboard：

Workers & Pages
→ Create
→ Worker
→ 创建一个 Worker，例如 `ltc-home-bus`

进入 Worker 编辑器，把 `worker/worker.js` 的全部内容复制进去并 Deploy。

部署后会得到：

https://ltc-home-bus.<你的子域>.workers.dev

先打开：

https://ltc-home-bus.<你的子域>.workers.dev/health

如果显示 JSON：

{"ok":true,...}

说明 Worker 工作正常。

再测试：

https://ltc-home-bus.<你的子域>.workers.dev/arrivals?stops=2407,2408,2409

应该会返回 arrivals 数组。

## 部署 2：把 Worker 地址填入主页

打开 `config.js`。

把：

TRANSIT_API_URL: "PASTE_YOUR_WORKER_URL_HERE"

改成：

TRANSIT_API_URL: "https://ltc-home-bus.<你的子域>.workers.dev"

保存。

## 部署 3：GitHub Pages

新建独立仓库，例如：

dashboard

把根目录这些文件上传：

- index.html
- style.css
- config.js
- app.js
- manifest.webmanifest
- sw.js
- icon.svg

不要上传 worker 文件夹也可以；Worker 已经在 Cloudflare 上。

然后：

Settings
→ Pages
→ Deploy from a branch
→ main
→ /(root)
→ Save

最终主页：

https://你的GitHub用户名.github.io/dashboard/

## 手机使用

第一次点击“回家”：
1. 设置
2. 输入完整家庭地址
3. 选择 Google Maps / Apple Maps
4. 保存

地址不会进入 GitHub。

公交会每 30 秒自动刷新，也可以点右上角 ↻ 手动刷新。

## 如果公交不显示

先直接打开 Worker：

/arrivals?stops=2407,2408,2409

检查是否有 arrivals。

如果 2407/2408/2409 不是你实际常用的站，可以在 `config.js` 的 TRANSIT_STOPS 中换成真正 Stop ID。

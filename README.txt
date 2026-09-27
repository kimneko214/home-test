home-test 重要通知 v6

这次只改 GitHub，不需要改 Cloudflare Worker。

完整替换：
- index.html
- config.js
- app.js
- style.css
- sw.js

保留不动：
- bus.html
- route.html
- Cloudflare worker.js

底部原来的 Tokyo / London 时间卡已经改成：

1. 日本邮政包裹
   CN134577206JP
   LX331479647JP

   每个包裹：
   - 查看追踪
   - 复制单号

2. 重要提醒
   以后直接编辑 config.js 的 IMPORTANT_NOTICE。

日本邮政按钮使用官方直接追踪链接：
https://trackings.post.japanpost.jp/services/srv/search/direct?locale=ja&reqCodeNo1=追踪号

Service Worker 缓存：
home-test-v6

home-test 日本邮政主页直显修正版 v8

这版修复两个问题：

1. 日本邮政 JSON 乱码
   原因：日本邮政追踪页的日文内容不是普通 UTF-8，
   之前 Worker 用 response.text() 解码，所以出现 å›½éš›... 之类乱码。
   v8 改成读取原始字节，再用 TextDecoder("shift_jis") 解码。

2. 首页仍显示“查看追踪”
   这说明 iPhone/PWA 仍加载了旧 app.js。
   v8 在 index.html 中把资源改成：
   style.css?v=8
   config.js?v=8
   app.js?v=8
   并注册 sw.js?v=8
   同时缓存名升级为 home-test-v8。

==================================================
需要替换
==================================================

Cloudflare ltc-home-bus2：
- worker.js

GitHub home-test：
- index.html
- app.js
- config.js
- style.css
- sw.js

bus.html / route.html 不需要改。

==================================================
部署后先测试 Worker
==================================================

打开：

https://ltc-home-bus2.jiangfan0611.workers.dev/japan-post?tracking=CN134577206JP,LX331479647JP

正常时不应该再看到：
å›½...
é…...

而应该看到正常的：
国際交換局から発送
川崎東郵便局
お届け先にお届け済み
等日文。

==================================================
然后测试主页
==================================================

https://kimneko214.github.io/home-test/

主页应该直接显示：
- 中文状态
- 日本邮政原始日文状态
- 最新时间
- 处理局 / 国家地区
- 最近 3 条记录

而不是“查看追踪”。

如果 Safari 仍然短暂显示旧版：
1. 关闭当前 home-test 标签页
2. 重新打开主页
3. 刷新一次

由于资源 URL 已经变成 ?v=8，正常情况下不需要清除整个 Safari 数据。

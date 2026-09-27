home-test 日本邮政卡片内直接显示追踪状态 v7

需要修改：

Cloudflare ltc-home-bus2
- 完整替换 worker.js
- TRANSITLAND_API_KEY 不用改

GitHub home-test
- config.js
- index.html
- app.js
- style.css
- sw.js

bus.html / route.html 不需要修改。

功能：
- 首页直接显示两个日本邮政包裹的当前状态
- 显示原始日文状态
- 显示最新时间和处理局
- 显示最近 3 条追踪历史
- 每 10 分钟自动刷新
- 手动刷新按钮
- 保留官方详情作为故障备用

包裹：
CN134577206JP
LX331479647JP

测试接口：
https://ltc-home-bus2.jiangfan0611.workers.dev/japan-post?tracking=CN134577206JP,LX331479647JP

注意：
此功能由 Cloudflare Worker 读取日本邮政官方追踪页面的“履歴情報”
并转换成 JSON。日本邮政如果以后改 HTML 结构，解析可能需要同步调整。

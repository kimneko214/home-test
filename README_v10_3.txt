home-test v10.3 — 修复“后台正常但始终 0 条记录”

已经定位到真正原因：

config.js 中定义的是：
const CONFIG = {...}

但 v10 的 visit.js 使用了：
window.CONFIG?.TRANSIT_API_URL

浏览器中，顶层 const CONFIG 不会自动变成 window.CONFIG。
因此 window.CONFIG 是 undefined，visit.js 在发送 /visit 之前就直接 return 了。

结果就是：
- D1 正常
- ADMIN_KEY 正常
- 管理后台正常
- 但没有任何访问写入，所以永远显示 0

v10.3 已改为直接读取：
typeof CONFIG !== "undefined" && CONFIG.TRANSIT_API_URL

并保留 Worker URL fallback。

==================================================
这次不需要修改 Cloudflare Worker
==================================================

GitHub home-test 替换：
- visit.js        必须
- index.html      必须（把 visit.js URL 升级到 ?v=10.3）
- bus.html        必须（如果也要记录公交详情页）
- route.html      必须（如果也要记录线路页）
- sw.js           建议

admin.html 不需要改。
worker.js 不需要改。

==================================================
测试
==================================================

1. 上传上述文件到 GitHub。
2. 等 GitHub Pages 部署完成。
3. 完全重新打开主页：
   https://kimneko214.github.io/home-test/
4. 再进入：
   https://kimneko214.github.io/home-test/admin.html
5. 点“刷新”。

应该至少出现 1 条 /home-test/ 记录。

之后打开 bus.html 或 route.html，也会各自新增访问记录。

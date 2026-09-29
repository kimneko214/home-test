Personal Dashboard v10 — 完整访问记录版

新增：
- 每次打开 / 重新载入 index.html、bus.html、route.html 都记录一次
- 记录：UTC 时间、访问 IP、国家/地区/城市、ASN、Cloudflare 机房、页面、来源、User-Agent、语言
- 不读取 GPS，也不读取你浏览器 localStorage 里的“家”地址
- 私人 admin.html 后台，必须输入 ADMIN_KEY 才能读取日志
- 管理密钥只放在 Cloudflare Secret；不会写进 GitHub

==================================================
一、Cloudflare 创建 D1 数据库
==================================================

1. Cloudflare Dashboard → Workers & Pages → D1 SQL Database
2. Create database
3. 名称建议：home-test-visits
4. 创建后进入数据库 → Console
5. 打开本 ZIP 的 schema.sql，把全部 SQL 粘贴进去 → Execute

==================================================
二、把 D1 绑定到 ltc-home-bus2
==================================================

Workers & Pages → ltc-home-bus2 → Settings → Bindings
→ Add binding → D1 database

Variable name 必须填写：
VISITS_DB

Database 选择刚才的：
home-test-visits

保存。

==================================================
三、添加管理员密钥
==================================================

ltc-home-bus2 → Settings → Variables and Secrets
→ Add → Secret

Name 必须填写：
ADMIN_KEY

Value：自己设置一个足够长的随机密码，例如至少 24 位。
不要把这个密码写进 GitHub / config.js。

原来的 TRANSITLAND_API_KEY 保留，不要删除。

==================================================
四、部署 Worker
==================================================

Cloudflare → ltc-home-bus2 → Edit Code
把 ZIP 里的 worker.js 完整替换 → Save and Deploy

先测试：
https://ltc-home-bus2.jiangfan0611.workers.dev/health

应该看到：
LTC Home Bus 2 v10 + Visit Log

==================================================
五、GitHub home-test 替换 / 新增
==================================================

完整替换：
- index.html
- app.js
- config.js
- style.css
- sw.js
- bus.html
- route.html

新增：
- visit.js
- admin.html
- manifest.webmanifest
- icon.svg

schema.sql 不需要放 GitHub；它只是给 D1 Console 执行。

==================================================
六、查看访问记录
==================================================

打开：
https://kimneko214.github.io/home-test/admin.html

输入你刚才设置的 ADMIN_KEY。

可以看到：
- 总访问记录
- 不同 IP 数
- 过去 24 小时访问数
- 每次访问时间
- 完整 IP
- 城市 / 地区 / 国家
- 页面
- ASN / Cloudflare colo
- 设备 / 浏览器（由 User-Agent 粗略识别）
- referrer
- 按 IP 搜索
- 每页 100 条

==================================================
七、如何确认记录成功
==================================================

1. 打开主页一次
2. 再打开 admin.html
3. 输入 ADMIN_KEY
4. 应出现一条 /home-test/ 访问记录
5. 点一辆公交进入 bus.html，会再增加一条
6. 打开 route.html，也会增加一条

注意：
- 公交每 30 秒刷新、包裹每 10 分钟刷新不会被算成新访问。
- 只有页面真正加载 / 重新载入时才记一条。
- IP 可能是运营商/NAT/VPN/Apple Private Relay 的出口 IP，不等于精确住址。
- Cloudflare 的 city/region 是基于连接 IP 的近似网络地理信息，不是 GPS。
- 如果网站给其他人使用，建议告知会记录 IP/访问时间，并根据需要设置数据保留期限。

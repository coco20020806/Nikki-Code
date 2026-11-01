# NikkiCode 微信小程序

首版目标：微信静默登录、兑换码查询、一键复制、云端同步兑换状态。

## 本地开发

1. 安装依赖：`npm install`
2. 启动监听构建：`npm run dev:weapp`
3. 在微信开发者工具中导入本目录；小程序源码目录由 `project.config.json` 指向 `dist/`。

## 上线前配置

- 微信公众平台将 `https://nikkigift.top` 添加为 request 合法域名。
- Vercel 环境变量添加 `WECHAT_MINI_APP_ID` 和 `WECHAT_MINI_APP_SECRET`。
- 在 Supabase SQL Editor 执行 `supabase/miniprogram_auth.sql`。
- AppSecret、Service Role Key 不得进入本目录或 Git。



# 饭饭日记

面向家庭成员的多人三餐记录 MVP。用户以演示微信身份进入同一家庭，上传早餐、午餐或晚餐照片，并确认 AI 生成的营养估算。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

本地开发由 Sites/Vinext 提供 D1 和 R2 模拟绑定。若 Windows 的 Workers 本地运行时无法启动，仍可执行 `npm run build` 完成部署构建。

## AI 配置

复制 `.env.example` 为 `.env.local`，按需配置：

- `OPENAI_API_KEY`：服务端调用 Responses API；不配置时使用明确标记的演示营养结果。
- `OPENAI_MODEL`：默认 `gpt-5.6-terra`。
- `DEMO_AUTH_ENABLED`：仅在明确设为 `true` 时显示三个演示身份；生产环境保持 `false`。
- `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_OAUTH_ORIGIN`：同时配置后开放微信 OAuth；回调地址为 `<WECHAT_OAUTH_ORIGIN>/api/auth/wechat/callback`。

## V2 家庭账号

公开站点仍由应用内会话保护。家人可使用高熵邀请码、昵称、头像和 6 位数字口令创建或加入家庭，口令以随机盐 PBKDF2 哈希保存。微信身份与内部用户通过 `user_identities` 解耦，后续绑定不会迁移或复制餐食数据。

密钥不得进入浏览器代码或提交到版本库。

## 数据与权限

- D1 逻辑绑定：`DB`
- R2 逻辑绑定：`MEAL_IMAGES`
- 每位成员每天每个餐次只能发布一条记录。
- 组内成员可以查看共同时间线，但只有作者可以编辑、分析、确认或删除自己的记录。
- 用户上传的图片通过鉴权接口读取，不使用公开 R2 地址。

## 接入正式微信登录

`app/lib/auth-provider.ts` 定义统一身份资料接口。正式接入时新增 WeChat provider，在服务端用 OAuth code 换取身份并映射：

- `unionid` 优先作为稳定的 `auth_subject`；无 unionid 时使用当前应用的 `openid`。
- `nickname` 映射为 `display_name`。
- `headimgurl` 映射为 `avatar_url`。

餐食、家庭和会话都只引用内部 `users.id`，因此替换登录提供方时不需要迁移餐食数据。

## 验证

```bash
npm run build
npm run lint
npx tsc --noEmit
node --test tests/rendered-html.test.mjs
```

import { getBindings } from "../../db";

export function getWechatConfig() {
  const { WECHAT_APP_ID: appId, WECHAT_APP_SECRET: appSecret, WECHAT_OAUTH_ORIGIN: origin } = getBindings();
  if (!appId || !appSecret || !origin) return null;
  return { appId, appSecret, origin: origin.replace(/\/$/, "") };
}

export function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function wechatAuthorizeUrl(appId: string, callbackUrl: string, state: string) {
  const query = new URLSearchParams({ appid: appId, redirect_uri: callbackUrl, response_type: "code", scope: "snsapi_userinfo", state });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${query.toString()}#wechat_redirect`;
}

export async function fetchWechatProfile(code: string) {
  const config = getWechatConfig();
  if (!config) throw new Error("微信登录暂未开放");
  const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  tokenUrl.search = new URLSearchParams({ appid: config.appId, secret: config.appSecret, code, grant_type: "authorization_code" }).toString();
  const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(15_000) });
  const token = await tokenResponse.json() as { access_token?: string; openid?: string; unionid?: string; errcode?: number; errmsg?: string };
  if (!tokenResponse.ok || !token.access_token || !token.openid) throw new Error("微信授权交换失败");
  const profileUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
  profileUrl.search = new URLSearchParams({ access_token: token.access_token, openid: token.openid, lang: "zh_CN" }).toString();
  const profileResponse = await fetch(profileUrl, { signal: AbortSignal.timeout(15_000) });
  const profile = await profileResponse.json() as { nickname?: string; headimgurl?: string; unionid?: string; errcode?: number };
  if (!profileResponse.ok || profile.errcode) throw new Error("微信资料读取失败");
  return {
    subject: profile.unionid || token.unionid || `${config.appId}:${token.openid}`,
    displayName: profile.nickname?.trim() || "微信用户",
    avatarUrl: profile.headimgurl || "",
  };
}

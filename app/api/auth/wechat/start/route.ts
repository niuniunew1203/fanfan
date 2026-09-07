import { ensureDatabase, getD1 } from "../../../../../db";
import { getCurrentUser, hashToken, routeError } from "../../../../lib/auth";
import { getWechatConfig, safeReturnTo, wechatAuthorizeUrl } from "../../../../lib/wechat";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const config = getWechatConfig();
    if (!config) return Response.json({ error: "微信登录暂未开放" }, { status: 503 });
    const url = new URL(request.url);
    const bind = url.searchParams.get("mode") === "bind";
    const user = bind ? await getCurrentUser(request) : null;
    if (bind && !user) return Response.json({ error: "请先登录家庭账号再绑定微信" }, { status: 401 });
    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await getD1().prepare(`INSERT INTO oauth_states (state_hash, return_to, bind_user_id, expires_at) VALUES (?, ?, ?, ?)`).bind(await hashToken(state), safeReturnTo(url.searchParams.get("returnTo")), user?.id ?? null, new Date(Date.now() + 10 * 60 * 1000).toISOString()).run();
    const callback = `${config.origin}/api/auth/wechat/callback`;
    return Response.redirect(wechatAuthorizeUrl(config.appId, callback, state), 302);
  } catch (error) {
    return routeError(error);
  }
}

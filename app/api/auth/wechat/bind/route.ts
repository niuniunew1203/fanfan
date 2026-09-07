import { getWechatConfig } from "../../../../lib/wechat";
import { requireUser, routeError } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    await requireUser(request);
    if (!getWechatConfig()) return Response.json({ error: "微信登录暂未开放" }, { status: 503 });
    return Response.json({ url: "/api/auth/wechat/start?mode=bind&returnTo=%2F" });
  } catch (error) {
    return routeError(error);
  }
}

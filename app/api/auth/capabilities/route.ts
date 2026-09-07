import { getBindings } from "../../../../db";
import type { AuthCapabilities } from "../../../lib/types";

export async function GET() {
  const env = getBindings();
  return Response.json({
    guestEnabled: true,
    demoEnabled: env.DEMO_AUTH_ENABLED === "true",
    wechatEnabled: Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET && env.WECHAT_OAUTH_ORIGIN),
  } satisfies AuthCapabilities);
}

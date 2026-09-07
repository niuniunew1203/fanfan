import { getBindings } from "../../../../db";
import { createSession, requireSameOrigin, routeError, sessionCookie } from "../../../lib/auth";
import { demoAuthProvider } from "../../../lib/auth-provider";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (getBindings().DEMO_AUTH_ENABLED !== "true") return Response.json({ error: "演示登录未开放" }, { status: 404 });
    const { userId } = await request.json() as { userId?: string };
    if (!userId || !(await demoAuthProvider.resolveProfile(userId))) return Response.json({ error: "请选择演示身份" }, { status: 400 });
    const { token, expiresAt } = await createSession(userId);
    return Response.json({ ok: true }, { status: 201, headers: { "set-cookie": sessionCookie(token, expiresAt) } });
  } catch (error) {
    return routeError(error);
  }
}

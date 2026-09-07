import { createSession, routeError, sessionCookie } from "../../../lib/auth";
import { demoAuthProvider } from "../../../lib/auth-provider";

export async function POST(request: Request) {
  try {
    const { userId } = await request.json() as { userId?: string };
    if (!userId || !(await demoAuthProvider.resolveProfile(userId))) return Response.json({ error: "请选择演示身份" }, { status: 400 });
    const { token, expiresAt } = await createSession(userId);
    return Response.json({ ok: true }, { status: 201, headers: { "set-cookie": sessionCookie(token, expiresAt) } });
  } catch (error) {
    return routeError(error);
  }
}

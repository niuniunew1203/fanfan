import { clearSessionCookie, deleteSession, routeError } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    await deleteSession(request);
    return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  } catch (error) {
    return routeError(error);
  }
}

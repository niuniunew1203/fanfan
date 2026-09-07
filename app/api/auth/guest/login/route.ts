import { ensureDatabase, getD1 } from "../../../../../db";
import { authAttemptKey, assertNotRateLimited, clearAuthFailures, createSession, recordAuthFailure, requireSameOrigin, routeError, sessionCookie, verifyPin } from "../../../../lib/auth";
import { normalizeInviteCode } from "../../../../lib/invites";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDatabase();
    const body = await request.json() as { inviteCode?: string; displayName?: string; pin?: string };
    const code = normalizeInviteCode(body.inviteCode ?? "");
    const displayName = body.displayName?.trim() ?? "";
    const pin = body.pin ?? "";
    if (!code || !displayName || !/^\d{6}$/.test(pin)) return Response.json({ error: "请输入邀请码、昵称和 6 位口令" }, { status: 400 });
    const key = await authAttemptKey(request, "guest-login", `${code}:${displayName}`);
    await assertNotRateLimited(key);
    const row = await getD1().prepare(`SELECT u.id, gc.pin_salt, gc.pin_hash, gc.iterations FROM invite_codes ic JOIN group_members gm ON gm.group_id = ic.group_id JOIN users u ON u.id = gm.user_id JOIN guest_credentials gc ON gc.user_id = u.id WHERE ic.code = ? AND ic.active = 1 AND LOWER(u.display_name) = LOWER(?) LIMIT 1`).bind(code, displayName).first<{ id: string; pin_salt: string; pin_hash: string; iterations: number }>();
    if (!row || !(await verifyPin(pin, row.pin_salt, row.pin_hash, row.iterations))) {
      await recordAuthFailure(key);
      return Response.json({ error: "邀请码、昵称或口令不正确" }, { status: 401 });
    }
    await clearAuthFailures(key);
    const session = await createSession(row.id);
    return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) } });
  } catch (error) {
    return routeError(error);
  }
}

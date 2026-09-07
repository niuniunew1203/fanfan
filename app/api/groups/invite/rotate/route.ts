import { getD1 } from "../../../../../db";
import { requireMembership, requireUser, routeError } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const membership = await requireMembership(user.id);
    if (membership.role !== "owner") return Response.json({ error: "只有家庭创建者可以更新邀请码" }, { status: 403 });
    const code = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    const db = getD1();
    await db.batch([
      db.prepare(`UPDATE invite_codes SET active = 0 WHERE group_id = ?`).bind(membership.id),
      db.prepare(`INSERT INTO invite_codes (code, group_id, active) VALUES (?, ?, 1)`).bind(code, membership.id),
    ]);
    return Response.json({ inviteCode: code });
  } catch (error) {
    return routeError(error);
  }
}

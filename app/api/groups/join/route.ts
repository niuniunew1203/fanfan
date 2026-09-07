import { ensureDatabase, getD1 } from "../../../../db";
import { getMembership, requireUser, routeError } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    if (await getMembership(user.id)) return Response.json({ error: "当前账号已经加入家庭" }, { status: 409 });
    const { code } = await request.json() as { code?: string };
    const normalized = code?.trim().toUpperCase();
    const invite = normalized ? await getD1().prepare(`SELECT group_id FROM invite_codes WHERE code = ? AND active = 1`).bind(normalized).first<{ group_id: string }>() : null;
    if (!invite) return Response.json({ error: "邀请码不存在或已失效" }, { status: 404 });
    await getD1().prepare(`INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')`).bind(invite.group_id, user.id).run();
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

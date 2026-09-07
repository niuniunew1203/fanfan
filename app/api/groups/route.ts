import { ensureDatabase, getD1 } from "../../../db";
import { getMembership, requireUser, routeError } from "../../lib/auth";
import { createInviteCode, inviteUrl } from "../../lib/invites";

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    if (await getMembership(user.id)) return Response.json({ error: "当前账号已经加入家庭" }, { status: 409 });
    const { name } = await request.json() as { name?: string };
    const groupName = name?.trim();
    if (!groupName || groupName.length > 20) return Response.json({ error: "家庭名称需为 1–20 个字" }, { status: 400 });
    const id = crypto.randomUUID();
    const code = await createInviteCode();
    const db = getD1();
    await db.batch([
      db.prepare(`INSERT INTO groups (id, name, owner_id) VALUES (?, ?, ?)`).bind(id, groupName, user.id),
      db.prepare(`INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')`).bind(id, user.id),
      db.prepare(`INSERT INTO invite_codes (code, group_id, active) VALUES (?, ?, 1)`).bind(code, id),
    ]);
    return Response.json({ group: { id, name: groupName, role: "owner", inviteCode: code, inviteUrl: inviteUrl(request, code) } }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

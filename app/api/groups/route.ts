import { ensureDatabase, getD1 } from "../../../db";
import { getMembership, requireUser, routeError } from "../../lib/auth";

function inviteCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    if (await getMembership(user.id)) return Response.json({ error: "当前账号已经加入家庭" }, { status: 409 });
    const { name } = await request.json() as { name?: string };
    const groupName = name?.trim();
    if (!groupName || groupName.length > 20) return Response.json({ error: "家庭名称需为 1–20 个字" }, { status: 400 });
    const id = crypto.randomUUID();
    const code = inviteCode();
    const db = getD1();
    await db.batch([
      db.prepare(`INSERT INTO groups (id, name, owner_id) VALUES (?, ?, ?)`).bind(id, groupName, user.id),
      db.prepare(`INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')`).bind(id, user.id),
      db.prepare(`INSERT INTO invite_codes (code, group_id, active) VALUES (?, ?, 1)`).bind(code, id),
    ]);
    return Response.json({ group: { id, name: groupName, role: "owner", inviteCode: code } }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

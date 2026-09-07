import { ensureDatabase, getBindings, getD1 } from "../../../../db";
import { requireMembership, requireUser, routeError } from "../../../lib/auth";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    await ensureDatabase();
    const viewer = await requireUser(request);
    const { userId } = await context.params;
    let target: { avatar_key: string | null } | null;
    if (userId === viewer.id) {
      target = await getD1().prepare(`SELECT avatar_key FROM users WHERE id = ?`).bind(userId).first<{ avatar_key: string | null }>();
    } else {
      const viewerMembership = await requireMembership(viewer.id);
      target = await getD1().prepare(`SELECT u.avatar_key FROM users u JOIN group_members gm ON gm.user_id = u.id WHERE u.id = ? AND gm.group_id = ?`).bind(userId, viewerMembership.id).first<{ avatar_key: string | null }>();
    }
    if (!target?.avatar_key) return Response.json({ error: "头像不存在" }, { status: 404 });
    const object = await getBindings().MEAL_IMAGES.get(target.avatar_key);
    if (!object) return Response.json({ error: "头像不存在" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=3600");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return routeError(error);
  }
}

import { getBindings, getD1 } from "../../../../db";
import { requireSessionTokenHash, routeError } from "../../../lib/auth";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await context.params;
    const tokenHash = await requireSessionTokenHash(request);
    const target = await getD1().prepare(`
      SELECT target_user.avatar_key FROM sessions s
      JOIN group_members viewer_member ON viewer_member.user_id = s.user_id
      JOIN group_members target_member ON target_member.group_id = viewer_member.group_id
      JOIN users target_user ON target_user.id = target_member.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND target_user.id = ?
      LIMIT 1
    `).bind(tokenHash, new Date().toISOString(), userId).first<{ avatar_key: string | null }>();
    if (!target?.avatar_key) return Response.json({ error: "头像不存在" }, { status: 404 });
    const etag = `"${target.avatar_key.replace(/[^a-zA-Z0-9]/g, "")}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { "cache-control": "private, max-age=604800, immutable", etag } });
    const object = await getBindings().MEAL_IMAGES.get(target.avatar_key);
    if (!object) return Response.json({ error: "头像不存在" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=604800, immutable");
    headers.set("etag", etag);
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return routeError(error);
  }
}

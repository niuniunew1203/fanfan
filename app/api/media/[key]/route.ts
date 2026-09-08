import { getBindings, getD1 } from "../../../../db";
import { requireSessionTokenHash, routeError } from "../../../lib/auth";

type Context = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { key } = await context.params;
    const imageKey = decodeURIComponent(key);
    const tokenHash = await requireSessionTokenHash(request);
    const allowed = await getD1().prepare(`
      SELECT m.id FROM sessions s
      JOIN group_members gm ON gm.user_id = s.user_id
      JOIN meals m ON m.group_id = gm.group_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND m.image_key = ?
      LIMIT 1
    `).bind(tokenHash, new Date().toISOString(), imageKey).first();
    if (!allowed) return new Response("Not found", { status: 404 });
    const etag = `"${imageKey.replace(/[^a-zA-Z0-9]/g, "")}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { "cache-control": "private, max-age=604800, immutable", etag } });
    const object = await getBindings().MEAL_IMAGES.get(imageKey);
    if (!object) return new Response("Not found", { status: 404 });
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

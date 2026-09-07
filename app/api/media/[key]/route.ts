import { getBindings, getD1 } from "../../../../db";
import { requireMembership, requireUser, routeError } from "../../../lib/auth";

type Context = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const membership = await requireMembership(user.id);
    const { key } = await context.params;
    const imageKey = decodeURIComponent(key);
    const allowed = await getD1().prepare(`SELECT id FROM meals WHERE image_key = ? AND group_id = ?`).bind(imageKey, membership.id).first();
    if (!allowed) return new Response("Not found", { status: 404 });
    const object = await getBindings().MEAL_IMAGES.get(imageKey);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=3600");
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return routeError(error);
  }
}

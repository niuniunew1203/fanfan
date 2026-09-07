import { getD1 } from "../../../../../db";
import { requireMembership, requireUser, routeError } from "../../../../lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const membership = await requireMembership(user.id);
    const { id } = await context.params;
    const meal = await getD1().prepare(`SELECT author_id FROM meals WHERE id = ? AND group_id = ?`).bind(id, membership.id).first<{ author_id: string }>();
    if (!meal) return Response.json({ error: "餐食记录不存在" }, { status: 404 });
    if (meal.author_id !== user.id) return Response.json({ error: "只能确认自己的分析" }, { status: 403 });
    const latest = await getD1().prepare(`SELECT id FROM meal_analyses WHERE meal_id = ? ORDER BY version DESC LIMIT 1`).bind(id).first();
    if (!latest) return Response.json({ error: "还没有可确认的营养结果" }, { status: 409 });
    const db = getD1();
    await db.batch([
      db.prepare(`UPDATE meal_analyses SET confirmed = 1 WHERE id = (SELECT id FROM meal_analyses WHERE meal_id = ? ORDER BY version DESC LIMIT 1)`).bind(id),
      db.prepare(`UPDATE meals SET analysis_status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}

import { getBindings, getD1 } from "../../../../db";
import { requireMembership, requireUser, routeError } from "../../../lib/auth";
import type { MealType } from "../../../lib/types";

type Context = { params: Promise<{ id: string }> };
const MEAL_TYPES = new Set<MealType>(["breakfast", "lunch", "dinner"]);

async function ownMeal(request: Request, id: string) {
  const user = await requireUser(request);
  const membership = await requireMembership(user.id);
  const meal = await getD1().prepare(`SELECT * FROM meals WHERE id = ? AND group_id = ?`).bind(id, membership.id).first<Record<string, string>>();
  if (!meal) throw new Response(JSON.stringify({ error: "餐食记录不存在" }), { status: 404, headers: { "content-type": "application/json" } });
  if (meal.author_id !== user.id) throw new Response(JSON.stringify({ error: "只能修改自己的餐食记录" }), { status: 403, headers: { "content-type": "application/json" } });
  return { meal, user, membership };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { meal } = await ownMeal(request, id);
    const body = await request.json() as { note?: string; mealDate?: string; mealType?: MealType };
    const note = body.note === undefined ? meal.note : body.note.trim().slice(0, 200);
    const mealDate = body.mealDate ?? meal.meal_date;
    const mealType = body.mealType ?? meal.meal_type as MealType;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate) || !MEAL_TYPES.has(mealType)) return Response.json({ error: "日期或餐次不正确" }, { status: 400 });
    await getD1().prepare(`UPDATE meals SET note = ?, meal_date = ?, meal_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(note, mealDate, mealType, id).run();
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) return Response.json({ error: "这个餐次已经有记录了" }, { status: 409 });
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { meal } = await ownMeal(request, id);
    const db = getD1();
    await db.batch([
      db.prepare(`DELETE FROM meal_analyses WHERE meal_id = ?`).bind(id),
      db.prepare(`DELETE FROM meals WHERE id = ?`).bind(id),
    ]);
    if (!meal.image_key.startsWith("/sample-")) await getBindings().MEAL_IMAGES?.delete(meal.image_key);
    return Response.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}

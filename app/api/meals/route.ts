import { getBindings, getD1 } from "../../../db";
import { requireMembership, requireUser, routeError } from "../../lib/auth";
import type { MealType } from "../../lib/types";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MEAL_TYPES = new Set<MealType>(["breakfast", "lunch", "dinner"]);

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const membership = await requireMembership(user.id);
    const form = await request.formData();
    const image = form.get("image");
    const mealDate = String(form.get("mealDate") ?? "");
    const mealType = String(form.get("mealType") ?? "") as MealType;
    const note = String(form.get("note") ?? "").trim().slice(0, 200);

    if (!(image instanceof File)) return Response.json({ error: "请选择一张餐食照片" }, { status: 400 });
    if (!ALLOWED_TYPES.has(image.type)) return Response.json({ error: "仅支持 JPEG、PNG 或 WebP 图片" }, { status: 415 });
    if (image.size > 10 * 1024 * 1024) return Response.json({ error: "图片不能超过 10 MB" }, { status: 413 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate) || !MEAL_TYPES.has(mealType)) return Response.json({ error: "请选择正确的日期和餐次" }, { status: 400 });

    const duplicate = await getD1().prepare(`SELECT id FROM meals WHERE group_id = ? AND author_id = ? AND meal_date = ? AND meal_type = ?`).bind(membership.id, user.id, mealDate, mealType).first();
    if (duplicate) return Response.json({ error: "这个餐次已经记录过了，可以打开原记录进行修改", mealId: duplicate.id }, { status: 409 });

    const id = crypto.randomUUID();
    const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    const imageKey = `${membership.id}/${user.id}/${id}.${extension}`;
    const bucket = getBindings().MEAL_IMAGES;
    if (!bucket) throw new Error("图片存储暂时不可用");
    await bucket.put(imageKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type }, customMetadata: { groupId: membership.id, ownerId: user.id } });
    try {
      await getD1().prepare(`INSERT INTO meals (id, group_id, author_id, meal_date, meal_type, note, image_key, analysis_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).bind(id, membership.id, user.id, mealDate, mealType, note, imageKey).run();
    } catch (error) {
      await bucket.delete(imageKey);
      throw error;
    }
    return Response.json({ mealId: id }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

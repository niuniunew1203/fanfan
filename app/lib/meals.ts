import { getD1 } from "../../db";
import type { Meal, NutritionResult, User } from "./types";

type MealRow = Record<string, string | number | null>;

export async function listMeals(groupId: string, userId: string, date?: string) {
  const where = date ? "WHERE m.group_id = ? AND m.meal_date = ?" : "WHERE m.group_id = ?";
  const values = date ? [groupId, date] : [groupId];
  const result = await getD1().prepare(`
    SELECT m.*, u.display_name, u.avatar_url, u.auth_provider,
      a.result_json, a.source analysis_source, a.confirmed analysis_confirmed
    FROM meals m
    JOIN users u ON u.id = m.author_id
    LEFT JOIN meal_analyses a ON a.id = (
      SELECT id FROM meal_analyses WHERE meal_id = m.id ORDER BY version DESC LIMIT 1
    )
    ${where}
    ORDER BY m.meal_date DESC,
      CASE m.meal_type WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 ELSE 3 END,
      m.created_at DESC
    LIMIT 60
  `).bind(...values).all<MealRow>();

  return result.results.map((row): Meal => ({
    id: String(row.id),
    mealDate: String(row.meal_date),
    mealType: row.meal_type as Meal["mealType"],
    note: String(row.note ?? ""),
    imageUrl: String(row.image_key).startsWith("/sample-") ? String(row.image_key) : `/api/media/${encodeURIComponent(String(row.image_key))}`,
    analysisStatus: row.analysis_status as Meal["analysisStatus"],
    createdAt: String(row.created_at),
    author: {
      id: String(row.author_id),
      displayName: String(row.display_name),
      avatarUrl: String(row.avatar_url),
      authProvider: row.auth_provider as User["authProvider"],
    },
    analysis: row.result_json ? {
      ...(JSON.parse(String(row.result_json)) as NutritionResult),
      source: row.analysis_source as "openai" | "demo",
      confirmed: Boolean(row.analysis_confirmed),
    } : null,
    canEdit: String(row.author_id) === userId,
  }));
}

export function demoNutrition(note = "") : NutritionResult {
  const breakfast = note.includes("粥") || note.includes("早餐");
  return breakfast ? {
    items: [
      { name: "杂粮粥", estimatedGrams: 280, caloriesKcal: 180, proteinG: 5.2, carbsG: 35, fatG: 2.1, confidence: "medium" },
      { name: "水煮蛋", estimatedGrams: 55, caloriesKcal: 78, proteinG: 6.5, carbsG: 0.6, fatG: 5.3, confidence: "high" },
      { name: "清炒时蔬", estimatedGrams: 120, caloriesKcal: 92, proteinG: 3.6, carbsG: 9, fatG: 5.1, confidence: "medium" },
    ],
    totals: { caloriesKcal: 350, proteinG: 15.3, carbsG: 44.6, fatG: 12.5, fiberG: 6.8, sodiumMg: 520 },
    comment: "主食、蛋白质和蔬菜搭配比较均衡，适合作为轻盈的早餐。",
    caveat: "图片无法准确判断烹调油和调味料用量，请按实际份量核对。",
  } : {
    items: [
      { name: "米饭", estimatedGrams: 180, caloriesKcal: 209, proteinG: 4.7, carbsG: 46.4, fatG: 0.5, confidence: "high" },
      { name: "家常炒肉", estimatedGrams: 150, caloriesKcal: 285, proteinG: 24, carbsG: 8, fatG: 18, confidence: "medium" },
      { name: "清炒青菜", estimatedGrams: 180, caloriesKcal: 126, proteinG: 5.4, carbsG: 12, fatG: 7.2, confidence: "medium" },
    ],
    totals: { caloriesKcal: 620, proteinG: 34.1, carbsG: 66.4, fatG: 25.7, fiberG: 8.2, sodiumMg: 880 },
    comment: "蛋白质和蔬菜都比较充足，主食份量适中。若在控盐，可减少酱汁摄入。",
    caveat: "这是演示估算；图片无法准确判断用油、酱汁与食材重量。",
  };
}

export function validateNutrition(input: unknown): NutritionResult {
  if (!input || typeof input !== "object") throw new Error("AI 返回结果格式不完整");
  const value = input as NutritionResult;
  if (!Array.isArray(value.items) || !value.totals || typeof value.comment !== "string" || typeof value.caveat !== "string") throw new Error("AI 返回结果格式不完整");
  const numberKeys = ["caloriesKcal", "proteinG", "carbsG", "fatG", "fiberG", "sodiumMg"] as const;
  for (const key of numberKeys) if (!Number.isFinite(value.totals[key]) || value.totals[key] < 0) throw new Error(`AI 返回的 ${key} 无效`);
  for (const item of value.items) {
    if (!item.name || item.name.length > 80 || !Number.isFinite(item.estimatedGrams) || item.estimatedGrams <= 0 || item.estimatedGrams > 5000 || !["high", "medium", "low"].includes(item.confidence)) throw new Error("AI 食物明细格式不完整");
    for (const key of ["caloriesKcal", "proteinG", "carbsG", "fatG"] as const) {
      if (!Number.isFinite(item[key]) || item[key] < 0) throw new Error("AI 食物营养值无效");
    }
  }
  return value;
}

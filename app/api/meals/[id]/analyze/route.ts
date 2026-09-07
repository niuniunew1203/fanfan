import { getBindings, getD1 } from "../../../../../db";
import { requireMembership, requireUser, routeError } from "../../../../lib/auth";
import { demoNutrition, validateNutrition } from "../../../../lib/meals";
import type { NutritionItem } from "../../../../lib/types";

type Context = { params: Promise<{ id: string }> };

const nutritionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "totals", "comment", "caveat"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "estimatedGrams", "caloriesKcal", "proteinG", "carbsG", "fatG", "confidence"],
        properties: {
          name: { type: "string" }, estimatedGrams: { type: "number" }, caloriesKcal: { type: "number" },
          proteinG: { type: "number" }, carbsG: { type: "number" }, fatG: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    totals: {
      type: "object", additionalProperties: false,
      required: ["caloriesKcal", "proteinG", "carbsG", "fatG", "fiberG", "sodiumMg"],
      properties: {
        caloriesKcal: { type: "number" }, proteinG: { type: "number" }, carbsG: { type: "number" },
        fatG: { type: "number" }, fiberG: { type: "number" }, sodiumMg: { type: "number" },
      },
    },
    comment: { type: "string" },
    caveat: { type: "string" },
  },
};

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return btoa(binary);
}

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as Array<{ content?: Array<{ type?: string; text?: string }> }>) {
    const part = item.content?.find((content) => content.type === "output_text");
    if (part?.text) return part.text;
  }
  throw new Error("AI 未返回可读取的营养结果");
}

async function callOpenAI(image: R2ObjectBody, note: string, corrections: NutritionItem[] | undefined) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const result = demoNutrition(`${note} ${corrections?.map((item) => item.name).join(" ") ?? ""}`);
    if (corrections?.length) {
      result.items = corrections.map((item) => {
        const original = result.items.find((candidate) => candidate.name === item.name) ?? item;
        const ratio = item.estimatedGrams / Math.max(original.estimatedGrams, 1);
        return { ...item, caloriesKcal: original.caloriesKcal * ratio, proteinG: original.proteinG * ratio, carbsG: original.carbsG * ratio, fatG: original.fatG * ratio };
      });
      result.totals.caloriesKcal = result.items.reduce((sum, item) => sum + item.caloriesKcal, 0);
      result.totals.proteinG = result.items.reduce((sum, item) => sum + item.proteinG, 0);
      result.totals.carbsG = result.items.reduce((sum, item) => sum + item.carbsG, 0);
      result.totals.fatG = result.items.reduce((sum, item) => sum + item.fatG, 0);
      result.comment = "已根据你修正的食物名称和份量重新估算；当前仍为演示数据。";
    }
    return { result, source: "demo" as const, model: "demo-nutrition-v1" };
  }
  const model = process.env.OPENAI_MODEL || "gpt-5.6-terra";
  const contentType = image.httpMetadata?.contentType || "image/jpeg";
  const prompt = `你是谨慎的饮食营养估算助手。识别照片中的每种食物并估算可食用重量和营养。只基于可见内容，不要把不确定内容说成事实。营养值均为整顿饭的估算值。用户备注：${note || "无"}。${corrections?.length ? `用户已修正的食物与份量：${JSON.stringify(corrections.map(({ name, estimatedGrams }) => ({ name, estimatedGrams })))}` : ""} comment 使用简洁中文；caveat 必须说明图片估算误差。`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `data:${contentType};base64,${toBase64(await image.arrayBuffer())}`, detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name: "meal_nutrition", strict: true, schema: nutritionSchema } },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`AI 分析失败（${response.status}）`);
  return { result: validateNutrition(JSON.parse(responseText(payload))), source: "openai" as const, model };
}

export async function POST(request: Request, context: Context) {
  let mealId = "";
  try {
    const user = await requireUser(request);
    const membership = await requireMembership(user.id);
    mealId = (await context.params).id;
    const meal = await getD1().prepare(`SELECT * FROM meals WHERE id = ? AND group_id = ?`).bind(mealId, membership.id).first<Record<string, string>>();
    if (!meal) return Response.json({ error: "餐食记录不存在" }, { status: 404 });
    if (meal.author_id !== user.id) return Response.json({ error: "只能分析自己的餐食记录" }, { status: 403 });
    if (meal.image_key.startsWith("/sample-")) return Response.json({ error: "示例餐食无需重新分析" }, { status: 400 });

    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() as { corrections?: NutritionItem[] } : {};
    await getD1().prepare(`UPDATE meals SET analysis_status = 'analyzing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(mealId).run();
    const object = await getBindings().MEAL_IMAGES.get(meal.image_key);
    if (!object) throw new Error("餐食照片不存在");
    const analyzed = await callOpenAI(object, meal.note, body.corrections);
    const versionRow = await getD1().prepare(`SELECT COALESCE(MAX(version), 0) + 1 next_version FROM meal_analyses WHERE meal_id = ?`).bind(mealId).first<{ next_version: number }>();
    const version = Number(versionRow?.next_version ?? 1);
    const db = getD1();
    await db.batch([
      db.prepare(`INSERT INTO meal_analyses (id, meal_id, version, result_json, source, model, confirmed) VALUES (?, ?, ?, ?, ?, ?, 0)`).bind(crypto.randomUUID(), mealId, version, JSON.stringify(analyzed.result), analyzed.source, analyzed.model),
      db.prepare(`UPDATE meals SET analysis_status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(mealId),
    ]);
    return Response.json({ analysis: analyzed.result, source: analyzed.source, confirmed: false });
  } catch (error) {
    if (mealId) await getD1().prepare(`UPDATE meals SET analysis_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(mealId).run().catch(() => undefined);
    return routeError(error);
  }
}

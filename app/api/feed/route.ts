import { requireMembership, requireUser, routeError } from "../../lib/auth";
import { listMeals } from "../../lib/meals";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const membership = await requireMembership(user.id);
    const date = new URL(request.url).searchParams.get("date") ?? undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "日期格式不正确" }, { status: 400 });
    return Response.json({ meals: await listMeals(membership.id, user.id, date) });
  } catch (error) {
    return routeError(error);
  }
}

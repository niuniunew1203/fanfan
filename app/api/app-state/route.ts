import { getD1 } from "../../../db";
import { getCurrentUser, getMembership, routeError } from "../../lib/auth";
import { listMeals } from "../../lib/meals";
import type { AppState, User } from "../../lib/types";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return Response.json({ user: null, group: null, members: [], meals: [] } satisfies AppState);
    const membership = await getMembership(user.id);
    if (!membership) return Response.json({ user, group: null, members: [], meals: [] } satisfies AppState);
    const memberRows = await getD1().prepare(`SELECT u.id, u.display_name, u.avatar_url, u.auth_provider FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY gm.joined_at`).bind(membership.id).all<Record<string, string>>();
    const members: User[] = memberRows.results.map((row) => ({ id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, authProvider: row.auth_provider as User["authProvider"] }));
    const meals = await listMeals(membership.id, user.id);
    return Response.json({
      user,
      group: { id: membership.id, name: membership.name, role: membership.role, inviteCode: membership.role === "owner" ? membership.inviteCode : null },
      members,
      meals,
    } satisfies AppState);
  } catch (error) {
    return routeError(error);
  }
}

import { getD1 } from "../../../db";
import { getCurrentAppContext, routeError } from "../../lib/auth";
import { listMeals } from "../../lib/meals";
import type { AppState, User } from "../../lib/types";
import { inviteUrl } from "../../lib/invites";

export async function GET(request: Request) {
  try {
    const context = await getCurrentAppContext(request);
    if (!context) return Response.json({ user: null, group: null, members: [], meals: [] } satisfies AppState);
    const { user, membership } = context;
    if (!membership) return Response.json({ user, group: null, members: [], meals: [] } satisfies AppState);
    const [memberRows, meals] = await Promise.all([
      getD1().prepare(`SELECT u.id, u.display_name, u.avatar_url, u.auth_provider FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY gm.joined_at`).bind(membership.id).all<Record<string, string>>(),
      listMeals(membership.id, user.id),
    ]);
    const members: User[] = memberRows.results.map((row) => ({ id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, authProvider: row.auth_provider as User["authProvider"] }));
    return Response.json({
      user,
      group: { id: membership.id, name: membership.name, role: membership.role, inviteCode: membership.role === "owner" ? membership.inviteCode : null, inviteUrl: membership.role === "owner" && membership.inviteCode ? inviteUrl(request, membership.inviteCode) : null },
      members,
      meals,
    } satisfies AppState);
  } catch (error) {
    return routeError(error);
  }
}

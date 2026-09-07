import { ensureDatabase, getBindings, getD1 } from "../../../../../db";
import { createSession, hashToken, sessionCookie } from "../../../../lib/auth";
import { fetchWechatProfile, getWechatConfig, safeReturnTo } from "../../../../lib/wechat";

function redirectError(request: Request, message: string) {
  const target = new URL("/", getWechatConfig()?.origin ?? new URL(request.url).origin);
  target.searchParams.set("authError", message);
  return Response.redirect(target, 302);
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    if (url.searchParams.get("error") || !url.searchParams.get("code")) return redirectError(request, "微信授权已取消");
    const state = url.searchParams.get("state") ?? "";
    const stateHash = await hashToken(state);
    const db = getD1();
    const saved = await db.prepare(`SELECT return_to, bind_user_id FROM oauth_states WHERE state_hash = ? AND used_at IS NULL AND expires_at > ?`).bind(stateHash, new Date().toISOString()).first<{ return_to: string; bind_user_id: string | null }>();
    if (!saved) return redirectError(request, "授权状态已失效，请重新登录");
    const consumed = await db.prepare(`UPDATE oauth_states SET used_at = ? WHERE state_hash = ? AND used_at IS NULL`).bind(new Date().toISOString(), stateHash).run();
    if (!consumed.meta.changes) return redirectError(request, "授权链接已使用");
    const profile = await fetchWechatProfile(url.searchParams.get("code")!);
    const existing = await db.prepare(`SELECT user_id FROM user_identities WHERE provider = 'wechat' AND subject = ?`).bind(profile.subject).first<{ user_id: string }>();
    const userId = saved.bind_user_id ?? existing?.user_id ?? crypto.randomUUID();
    if (saved.bind_user_id && existing && existing.user_id !== saved.bind_user_id) return redirectError(request, "该微信已绑定其他账号");

    let avatarKey: string | null = null;
    if (profile.avatarUrl) {
      try {
        const response = await fetch(profile.avatarUrl, { signal: AbortSignal.timeout(10_000) });
        const contentType = response.headers.get("content-type") ?? "image/jpeg";
        if (response.ok && contentType.startsWith("image/") && Number(response.headers.get("content-length") ?? 0) < 5 * 1024 * 1024) {
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("微信头像过大");
          avatarKey = `avatars/${userId}-wechat.jpg`;
          await getBindings().MEAL_IMAGES.put(avatarKey, bytes, { httpMetadata: { contentType, cacheControl: "private, max-age=3600" } });
        }
      } catch { /* profile remains usable without a mirrored avatar */ }
    }
    if (!saved.bind_user_id && !existing) {
      await db.prepare(`INSERT INTO users (id, auth_provider, auth_subject, display_name, avatar_url, avatar_key) VALUES (?, 'wechat', ?, ?, ?, ?)`).bind(userId, profile.subject, profile.displayName, avatarKey ? `/api/avatar/${userId}` : profile.avatarUrl, avatarKey).run();
    } else {
      await db.prepare(`UPDATE users SET display_name = ?, avatar_url = CASE WHEN ? IS NOT NULL THEN ? ELSE avatar_url END, avatar_key = COALESCE(?, avatar_key), auth_provider = 'wechat' WHERE id = ?`).bind(profile.displayName, avatarKey, `/api/avatar/${userId}`, avatarKey, userId).run();
    }
    await db.prepare(`INSERT OR IGNORE INTO user_identities (provider, subject, user_id) VALUES ('wechat', ?, ?)`).bind(profile.subject, userId).run();
    const session = await createSession(userId);
    const target = new URL(safeReturnTo(saved.return_to), getWechatConfig()!.origin);
    return new Response(null, { status: 302, headers: { location: target.toString(), "set-cookie": sessionCookie(session.token, session.expiresAt) } });
  } catch (error) {
    console.error(error);
    return redirectError(request, "微信登录没有完成，请重试");
  }
}

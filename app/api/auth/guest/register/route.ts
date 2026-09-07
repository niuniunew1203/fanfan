import { ensureDatabase, getBindings, getD1 } from "../../../../../db";
import { authAttemptKey, assertNotRateLimited, clearAuthFailures, createSession, hashPin, recordAuthFailure, requireSameOrigin, routeError, sessionCookie } from "../../../../lib/auth";
import { createInviteCode, inviteUrl, normalizeInviteCode } from "../../../../lib/invites";
import { matchesImageType } from "../../../../lib/images";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(request: Request) {
  let avatarKey: string | null = null;
  let registrationCommitted = false;
  try {
    requireSameOrigin(request);
    await ensureDatabase();
    const form = await request.formData();
    const mode = String(form.get("mode") ?? "join");
    const displayName = String(form.get("displayName") ?? "").trim();
    const pin = String(form.get("pin") ?? "");
    const groupName = String(form.get("groupName") ?? "").trim();
    const codeInput = normalizeInviteCode(String(form.get("inviteCode") ?? ""));
    const avatar = form.get("avatar");
    if (!['create', 'join'].includes(mode)) return Response.json({ error: "注册方式无效" }, { status: 400 });
    if (!displayName || displayName.length > 20) return Response.json({ error: "昵称需要 1–20 个字" }, { status: 400 });
    if (!/^\d{6}$/.test(pin)) return Response.json({ error: "请设置 6 位数字口令" }, { status: 400 });
    if (!(avatar instanceof File) || !IMAGE_TYPES[avatar.type] || avatar.size > 3 * 1024 * 1024) return Response.json({ error: "请上传不超过 3 MB 的 JPEG、PNG 或 WebP 头像" }, { status: 400 });
    const avatarBytes = await avatar.arrayBuffer();
    if (!matchesImageType(avatarBytes, avatar.type)) return Response.json({ error: "头像内容与文件格式不匹配" }, { status: 415 });

    const attemptKey = await authAttemptKey(request, `guest-register-${mode}`, mode === "join" ? codeInput : displayName);
    await assertNotRateLimited(attemptKey);
    const db = getD1();
    let groupId: string;
    let code: string;
    let role: "owner" | "member";
    if (mode === "join") {
      const invite = codeInput ? await db.prepare(`SELECT group_id FROM invite_codes WHERE code = ? AND active = 1`).bind(codeInput).first<{ group_id: string }>() : null;
      if (!invite) { await recordAuthFailure(attemptKey); return Response.json({ error: "邀请码不存在或已失效" }, { status: 404 }); }
      groupId = invite.group_id; code = codeInput; role = "member";
      const duplicate = await db.prepare(`SELECT 1 FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND LOWER(u.display_name) = LOWER(?)`).bind(groupId, displayName).first();
      if (duplicate) return Response.json({ error: "这个昵称已在家庭中使用，请换一个昵称或直接登录" }, { status: 409 });
    } else {
      if (!groupName || groupName.length > 20) return Response.json({ error: "家庭名称需要 1–20 个字" }, { status: 400 });
      groupId = crypto.randomUUID(); code = await createInviteCode(); role = "owner";
    }

    const userId = crypto.randomUUID();
    avatarKey = `avatars/${userId}.${IMAGE_TYPES[avatar.type]}`;
    await getBindings().MEAL_IMAGES.put(avatarKey, avatarBytes, { httpMetadata: { contentType: avatar.type, cacheControl: "private, max-age=3600" } });
    const credential = await hashPin(pin);
    const statements = [
      db.prepare(`INSERT INTO users (id, auth_provider, auth_subject, display_name, avatar_url, avatar_key) VALUES (?, 'guest', ?, ?, ?, ?)`).bind(userId, userId, displayName, `/api/avatar/${userId}`, avatarKey),
      db.prepare(`INSERT INTO user_identities (provider, subject, user_id) VALUES ('guest', ?, ?)`).bind(userId, userId),
      db.prepare(`INSERT INTO guest_credentials (user_id, pin_salt, pin_hash, iterations) VALUES (?, ?, ?, ?)`).bind(userId, credential.salt, credential.hash, credential.iterations),
    ];
    if (mode === "create") statements.push(
      db.prepare(`INSERT INTO groups (id, name, owner_id) VALUES (?, ?, ?)`).bind(groupId, groupName, userId),
      db.prepare(`INSERT INTO invite_codes (code, group_id, active) VALUES (?, ?, 1)`).bind(code, groupId),
    );
    statements.push(db.prepare(`INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)`).bind(groupId, userId, role));
    await db.batch(statements);
    registrationCommitted = true;
    await clearAuthFailures(attemptKey);
    const session = await createSession(userId);
    return Response.json({ ok: true, inviteCode: code, inviteUrl: inviteUrl(request, code) }, { status: 201, headers: { "set-cookie": sessionCookie(session.token, session.expiresAt) } });
  } catch (error) {
    if (avatarKey && !registrationCommitted) await getBindings().MEAL_IMAGES.delete(avatarKey).catch(() => undefined);
    return routeError(error);
  }
}

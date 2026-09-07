import { ensureDatabase, getD1 } from "../../db";
import type { User } from "./types";

const COOKIE_NAME = "fanfan_session";

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export async function createSession(userId: string) {
  await ensureDatabase();
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await getD1().prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`).bind(tokenHash, userId, expiresAt).run();
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: string) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

export async function deleteSession(request: Request) {
  await ensureDatabase();
  const token = readCookie(request, COOKIE_NAME);
  if (token) await getD1().prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await hashToken(token)).run();
}

export async function getCurrentUser(request: Request): Promise<User | null> {
  await ensureDatabase();
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const row = await getD1().prepare(`SELECT u.id, u.display_name, u.avatar_url, u.auth_provider FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await hashToken(token), new Date().toISOString()).first<Record<string, string>>();
  if (!row) return null;
  return { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, authProvider: row.auth_provider as "demo" | "wechat" };
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw new Response(JSON.stringify({ error: "请先登录" }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
}

export async function getMembership(userId: string) {
  const row = await getD1().prepare(`SELECT g.id, g.name, g.owner_id, gm.role, (SELECT code FROM invite_codes WHERE group_id = g.id AND active = 1 ORDER BY created_at DESC LIMIT 1) invite_code FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = ? LIMIT 1`).bind(userId).first<Record<string, string>>();
  return row ? { id: row.id, name: row.name, ownerId: row.owner_id, role: row.role as "owner" | "member", inviteCode: row.invite_code ?? null } : null;
}

export async function requireMembership(userId: string) {
  const membership = await getMembership(userId);
  if (!membership) throw new Response(JSON.stringify({ error: "请先创建或加入家庭" }), { status: 403, headers: { "content-type": "application/json" } });
  return membership;
}

export function routeError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "服务暂时不可用";
  return Response.json({ error: message }, { status: 500 });
}

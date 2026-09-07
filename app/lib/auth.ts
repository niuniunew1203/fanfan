import { ensureDatabase, getD1 } from "../../db";
import type { User } from "./types";

const COOKIE_NAME = "fanfan_session";
const PIN_ITERATIONS = 210_000;
const encoder = new TextEncoder();

export function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...data].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export function requireSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) {
    throw Response.json({ error: "请求来源校验失败，请刷新页面后重试" }, { status: 403 });
  }
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
  requireSameOrigin(request);
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
  return { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, authProvider: row.auth_provider as User["authProvider"] };
}

export async function requireUser(request: Request) {
  requireSameOrigin(request);
  const user = await getCurrentUser(request);
  if (!user) throw Response.json({ error: "请先登录" }, { status: 401 });
  return user;
}

export async function getMembership(userId: string) {
  const row = await getD1().prepare(`SELECT g.id, g.name, g.owner_id, gm.role, (SELECT code FROM invite_codes WHERE group_id = g.id AND active = 1 ORDER BY created_at DESC LIMIT 1) invite_code FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = ? LIMIT 1`).bind(userId).first<Record<string, string>>();
  return row ? { id: row.id, name: row.name, ownerId: row.owner_id, role: row.role as "owner" | "member", inviteCode: row.invite_code ?? null } : null;
}

export async function requireMembership(userId: string) {
  const membership = await getMembership(userId);
  if (!membership) throw Response.json({ error: "请先创建或加入家庭" }, { status: 403 });
  return membership;
}

export async function hashPin(pin: string, saltHex?: string, iterations = PIN_ITERATIONS) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{1,2}/g) ?? [], (part) => Number.parseInt(part, 16)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(hash), iterations };
}

export async function verifyPin(pin: string, salt: string, expected: string, iterations: number) {
  const actual = (await hashPin(pin, salt, iterations)).hash;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function authAttemptKey(request: Request, action: string, identifier: string) {
  return hashToken(`${action}:${clientIp(request)}:${identifier.toLowerCase()}`);
}

export async function assertNotRateLimited(key: string, maxFailures = 5) {
  const row = await getD1().prepare(`SELECT failures, window_started_at, locked_until FROM auth_attempts WHERE attempt_key = ?`).bind(key).first<{ failures: number; window_started_at: string; locked_until: string | null }>();
  if (!row) return;
  const now = Date.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) throw Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });
  if (row.failures >= maxFailures && Date.parse(row.window_started_at) > now - 15 * 60 * 1000) throw Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });
}

export async function recordAuthFailure(key: string) {
  const now = new Date();
  const current = await getD1().prepare(`SELECT failures, window_started_at FROM auth_attempts WHERE attempt_key = ?`).bind(key).first<{ failures: number; window_started_at: string }>();
  const expired = !current || Date.parse(current.window_started_at) < now.getTime() - 15 * 60 * 1000;
  const failures = expired ? 1 : current.failures + 1;
  const lock = failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
  await getD1().prepare(`INSERT INTO auth_attempts (attempt_key, failures, window_started_at, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(attempt_key) DO UPDATE SET failures = excluded.failures, window_started_at = excluded.window_started_at, locked_until = excluded.locked_until`).bind(key, failures, expired ? now.toISOString() : current.window_started_at, lock).run();
}

export async function clearAuthFailures(key: string) {
  await getD1().prepare(`DELETE FROM auth_attempts WHERE attempt_key = ?`).bind(key).run();
}

export function routeError(error: unknown) {
  if (error instanceof Response) return error;
  console.error(error);
  return Response.json({ error: "服务暂时不可用，请稍后重试" }, { status: 500 });
}

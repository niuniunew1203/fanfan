import { getD1 } from "../../db";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function createInviteCode(length = 12) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const random = crypto.getRandomValues(new Uint8Array(length));
    const code = [...random].map((value) => ALPHABET[value % ALPHABET.length]).join("");
    const exists = await getD1().prepare(`SELECT 1 FROM invite_codes WHERE code = ?`).bind(code).first();
    if (!exists) return code;
  }
  throw new Error("邀请码生成失败，请重试");
}

export function inviteUrl(request: Request, code: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("invite", code);
  return url.toString();
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("guest credentials use salted PBKDF2 and rate limiting", async () => {
  const auth = await read("app/lib/auth.ts");
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /210_000/);
  assert.match(auth, /auth_attempts/);
  assert.match(auth, /SameSite=Lax; Secure/);
  assert.match(auth, /requireSameOrigin/);
});

test("production demo auth and WeChat are capability gated", async () => {
  const capabilities = await read("app/api/auth/capabilities/route.ts");
  const demo = await read("app/api/auth/demo/route.ts");
  assert.match(capabilities, /DEMO_AUTH_ENABLED === "true"/);
  assert.match(capabilities, /WECHAT_APP_ID && env\.WECHAT_APP_SECRET && env\.WECHAT_OAUTH_ORIGIN/);
  assert.match(demo, /演示登录未开放/);
});

test("WeChat OAuth state is expiring and single use", async () => {
  const start = await read("app/api/auth/wechat/start/route.ts");
  const callback = await read("app/api/auth/wechat/callback/route.ts");
  assert.match(start, /10 \* 60 \* 1000/);
  assert.match(callback, /used_at IS NULL AND expires_at/);
  assert.match(callback, /UPDATE oauth_states SET used_at/);
  assert.match(callback, /unionid|subject/);
});

test("AI uses runtime bindings, strict JSON and a 45 second timeout", async () => {
  const analyze = await read("app/api/meals/[id]/analyze/route.ts");
  assert.doesNotMatch(analyze, /process\.env/);
  assert.match(analyze, /strict: true/);
  assert.match(analyze, /AbortSignal\.timeout\(45_000\)/);
  assert.match(analyze, /analysis_locked/);
});

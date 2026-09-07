import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("finished app replaces starter and exposes core flows", async () => {
  const page = await readFile(new URL("../app/FanFanApp.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.match(page, /饭饭日记/);
  assert.match(page, /微信登录（演示）/);
  assert.match(page, /保存并开始分析/);
  assert.match(page, /家庭成员/);
  assert.match(layout, /把每顿饭，记成家的日常/);
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "MEAL_IMAGES");
});

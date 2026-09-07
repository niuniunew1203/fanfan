import { env } from "cloudflare:workers";

export type AppEnv = {
  DB: D1Database;
  MEAL_IMAGES: R2Bucket;
};

export function getBindings() {
  return env as unknown as AppEnv;
}

export function getD1() {
  const { DB } = getBindings();
  if (!DB) throw new Error("D1 binding DB is unavailable");
  return DB;
}

let ready: Promise<void> | null = null;

export async function ensureDatabase() {
  if (!ready) ready = initializeDatabase().catch((error) => { ready = null; throw error; });
  return ready;
}

async function initializeDatabase() {
  const db = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, auth_provider TEXT NOT NULL, auth_subject TEXT NOT NULL, display_name TEXT NOT NULL, avatar_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(auth_provider, auth_subject))`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(owner_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(group_id, user_id), FOREIGN KEY(group_id) REFERENCES groups(id), FOREIGN KEY(user_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS invite_codes (code TEXT PRIMARY KEY, group_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id))`,
    `CREATE TABLE IF NOT EXISTS meals (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, author_id TEXT NOT NULL, meal_date TEXT NOT NULL, meal_type TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', image_key TEXT NOT NULL, analysis_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(group_id, author_id, meal_date, meal_type), FOREIGN KEY(group_id) REFERENCES groups(id), FOREIGN KEY(author_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS meal_analyses (id TEXT PRIMARY KEY, meal_id TEXT NOT NULL, version INTEGER NOT NULL, result_json TEXT NOT NULL, source TEXT NOT NULL, model TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, error_message TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(meal_id, version), FOREIGN KEY(meal_id) REFERENCES meals(id))`,
    `CREATE INDEX IF NOT EXISTS meals_group_date_idx ON meals(group_id, meal_date, created_at)`,
    `CREATE INDEX IF NOT EXISTS analyses_meal_idx ON meal_analyses(meal_id, version DESC)`,
  ];
  await db.batch(statements.map((sql) => db.prepare(sql)));

  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO users (id, auth_provider, auth_subject, display_name, avatar_url) VALUES (?, 'demo', ?, ?, ?)`)
      .bind("demo-lin", "demo-lin", "小林", "/avatars/lin.jpg"),
    db.prepare(`INSERT OR IGNORE INTO users (id, auth_provider, auth_subject, display_name, avatar_url) VALUES (?, 'demo', ?, ?, ?)`)
      .bind("demo-mum", "demo-mum", "妈妈", "/avatars/mum.jpg"),
    db.prepare(`INSERT OR IGNORE INTO users (id, auth_provider, auth_subject, display_name, avatar_url) VALUES (?, 'demo', ?, ?, ?)`)
      .bind("demo-chen", "demo-chen", "阿辰", "/avatars/chen.jpg"),
    db.prepare(`INSERT OR IGNORE INTO groups (id, name, owner_id) VALUES ('demo-family', '我们家', 'demo-lin')`),
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ('demo-family', 'demo-lin', 'owner')`),
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ('demo-family', 'demo-mum', 'member')`),
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ('demo-family', 'demo-chen', 'member')`),
    db.prepare(`INSERT OR IGNORE INTO invite_codes (code, group_id, active) VALUES ('FANFAN88', 'demo-family', 1)`),
  ]);

  const breakfastAnalysis = JSON.stringify({
    items: [
      { name: "杂粮粥", estimatedGrams: 280, caloriesKcal: 180, proteinG: 5.2, carbsG: 35, fatG: 2.1, confidence: "medium" },
      { name: "水煮蛋", estimatedGrams: 55, caloriesKcal: 78, proteinG: 6.5, carbsG: 0.6, fatG: 5.3, confidence: "high" },
      { name: "清爽小菜", estimatedGrams: 100, caloriesKcal: 72, proteinG: 2.6, carbsG: 8, fatG: 3.6, confidence: "medium" },
    ],
    totals: { caloriesKcal: 330, proteinG: 14.3, carbsG: 43.6, fatG: 11, fiberG: 6.2, sodiumMg: 480 },
    comment: "谷物、蛋白质和蔬菜都有，清爽又均衡。",
    caveat: "图片估算可能受份量和烹调油影响，请按实际情况核对。",
  });
  const lunchAnalysis = JSON.stringify({
    items: [
      { name: "米饭", estimatedGrams: 170, caloriesKcal: 197, proteinG: 4.4, carbsG: 43.8, fatG: 0.5, confidence: "high" },
      { name: "时蔬炒肉", estimatedGrams: 220, caloriesKcal: 298, proteinG: 25, carbsG: 15, fatG: 16, confidence: "medium" },
      { name: "清汤", estimatedGrams: 220, caloriesKcal: 65, proteinG: 5, carbsG: 6, fatG: 2, confidence: "low" },
    ],
    totals: { caloriesKcal: 560, proteinG: 34.4, carbsG: 64.8, fatG: 18.5, fiberG: 8.5, sodiumMg: 760 },
    comment: "蔬菜和优质蛋白较充足，整体份量适中。",
    caveat: "汤和酱汁的含盐量难以仅凭图片判断。",
  });
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO meals (id, group_id, author_id, meal_date, meal_type, note, image_key, analysis_status) VALUES ('sample-breakfast', 'demo-family', 'demo-mum', date('now', '+8 hours'), 'breakfast', '早起的一碗热粥，今天也要好好吃饭', '/sample-breakfast.jpg', 'confirmed')`),
    db.prepare(`INSERT OR IGNORE INTO meals (id, group_id, author_id, meal_date, meal_type, note, image_key, analysis_status) VALUES ('sample-lunch', 'demo-family', 'demo-chen', date('now', '+8 hours'), 'lunch', '家常午饭，青菜是今天刚买的', '/sample-lunch.jpg', 'confirmed')`),
    db.prepare(`INSERT OR IGNORE INTO meals (id, group_id, author_id, meal_date, meal_type, note, image_key, analysis_status) VALUES ('sample-dinner', 'demo-family', 'demo-lin', date('now', '+8 hours', '-1 day'), 'dinner', '下班后的简单晚餐', '/sample-dinner.jpg', 'confirmed')`),
    db.prepare(`INSERT OR IGNORE INTO meal_analyses (id, meal_id, version, result_json, source, model, confirmed) VALUES ('analysis-breakfast', 'sample-breakfast', 1, ?, 'demo', 'demo-nutrition-v1', 1)`).bind(breakfastAnalysis),
    db.prepare(`INSERT OR IGNORE INTO meal_analyses (id, meal_id, version, result_json, source, model, confirmed) VALUES ('analysis-lunch', 'sample-lunch', 1, ?, 'demo', 'demo-nutrition-v1', 1)`).bind(lunchAnalysis),
    db.prepare(`INSERT OR IGNORE INTO meal_analyses (id, meal_id, version, result_json, source, model, confirmed) VALUES ('analysis-dinner', 'sample-dinner', 1, ?, 'demo', 'demo-nutrition-v1', 1)`).bind(lunchAnalysis),
  ]);
}

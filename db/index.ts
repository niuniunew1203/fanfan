import postgres, { type Sql } from "postgres";
import { getStore } from "@netlify/blobs";

export type StoredImage = {
  body: ReadableStream<Uint8Array>;
  httpEtag: string;
  httpMetadata: { contentType?: string; cacheControl?: string };
  writeHttpMetadata(headers: Headers): void;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type AppEnv = {
  DATABASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  WECHAT_APP_ID?: string;
  WECHAT_APP_SECRET?: string;
  WECHAT_OAUTH_ORIGIN?: string;
  DEMO_AUTH_ENABLED?: string;
  MEAL_IMAGES: {
    put(key: string, value: ArrayBuffer, options?: unknown): Promise<void>;
    get(key: string): Promise<StoredImage | null>;
    delete(key: string): Promise<void>;
  };
};

function contentTypeForKey(key: string) {
  if (/\.png$/i.test(key)) return "image/png";
  if (/\.webp$/i.test(key)) return "image/webp";
  return "image/jpeg";
}

const imageStore = {
  async put(key: string, value: ArrayBuffer) {
    await getStore("fanfan-diary-images").set(key, value);
  },
  async get(key: string): Promise<StoredImage | null> {
    const value = await getStore("fanfan-diary-images").get(key, { type: "blob" });
    if (!(value instanceof Blob)) return null;
    const contentType = value.type || contentTypeForKey(key);
    return {
      body: value.stream(),
      httpEtag: `\"${key.replace(/[^a-zA-Z0-9]/g, "")}\"`,
      httpMetadata: { contentType, cacheControl: "private, max-age=3600" },
      writeHttpMetadata(headers: Headers) { headers.set("content-type", contentType); },
      arrayBuffer: () => value.arrayBuffer(),
    };
  },
  async delete(key: string) {
    await getStore("fanfan-diary-images").delete(key);
  },
};

export function getBindings(): AppEnv {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    WECHAT_APP_ID: process.env.WECHAT_APP_ID,
    WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET,
    WECHAT_OAUTH_ORIGIN: process.env.WECHAT_OAUTH_ORIGIN,
    DEMO_AUTH_ENABLED: process.env.DEMO_AUTH_ENABLED,
    MEAL_IMAGES: imageStore,
  };
}

let sqlClient: Sql | null = null;

function getSql() {
  if (sqlClient) return sqlClient;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is unavailable");
  sqlClient = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 15, ssl: "require" });
  return sqlClient;
}

function normalizeSql(input: string) {
  let index = 0;
  let output = input
    .replace(/datetime\('now',\s*'-2 minutes'\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '2 minutes')")
    .replace(/date\('now',\s*'\+8 hours',\s*'-1 day'\)/gi, "((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') - INTERVAL '1 day')::date::text")
    .replace(/date\('now',\s*'\+8 hours'\)/gi, "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date::text")
    .replace(/\?/g, () => `$${++index}`);
  if (/^\s*INSERT\s+OR\s+IGNORE\s+/i.test(output)) {
    output = output.replace(/^\s*INSERT\s+OR\s+IGNORE\s+/i, "INSERT ");
    output = `${output.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;
  }
  return output;
}

function normalizeRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])) as T;
}

class PreparedStatement {
  private values: unknown[] = [];
  constructor(private readonly source: string, private readonly executor?: Sql) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  private async execute() {
    const client = this.executor ?? getSql();
    return client.unsafe(normalizeSql(this.source), this.values as never[]);
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const rows = await this.execute();
    return rows[0] ? normalizeRow<T>(rows[0] as Record<string, unknown>) : null;
  }
  async all<T = Record<string, unknown>>() {
    const rows = await this.execute();
    return { results: rows.map((row) => normalizeRow<T>(row as Record<string, unknown>)) };
  }
  async run() {
    const rows = await this.execute();
    return { success: true, meta: { changes: rows.count ?? 0 } };
  }
  clone(executor: Sql) { return new PreparedStatement(this.source, executor).bind(...this.values); }
}

export function getD1() {
  return {
    prepare(source: string) { return new PreparedStatement(source); },
    async batch(statements: PreparedStatement[]) {
      return getSql().begin(async (transaction) => Promise.all(statements.map((statement) => statement.clone(transaction as unknown as Sql).run())));
    },
  };
}

let ready: Promise<void> | null = null;

export async function ensureDatabase() {
  if (!ready) ready = initializeDatabase().catch((error) => { ready = null; throw error; });
  return ready;
}

async function initializeDatabase() {
  const db = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, auth_provider TEXT NOT NULL, auth_subject TEXT NOT NULL, display_name TEXT NOT NULL, avatar_url TEXT NOT NULL, avatar_key TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text), UNIQUE(auth_provider, auth_subject))`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text))`,
    `CREATE TABLE IF NOT EXISTS user_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text), UNIQUE(provider, subject))`,
    `CREATE TABLE IF NOT EXISTS guest_credentials (user_id TEXT PRIMARY KEY REFERENCES users(id), pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL, iterations INTEGER NOT NULL DEFAULT 210000, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text))`,
    `CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, return_to TEXT NOT NULL DEFAULT '/', bind_user_id TEXT, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text))`,
    `CREATE TABLE IF NOT EXISTS auth_attempts (attempt_key TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, window_started_at TEXT NOT NULL, locked_until TEXT)`,
    `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text))`,
    `CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL DEFAULT 'member', joined_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text), UNIQUE(group_id, user_id))`,
    `CREATE TABLE IF NOT EXISTS invite_codes (code TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text))`,
    `CREATE TABLE IF NOT EXISTS meals (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), author_id TEXT NOT NULL REFERENCES users(id), meal_date TEXT NOT NULL, meal_type TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', image_key TEXT NOT NULL, analysis_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text), UNIQUE(group_id, author_id, meal_date, meal_type))`,
    `CREATE TABLE IF NOT EXISTS meal_analyses (id TEXT PRIMARY KEY, meal_id TEXT NOT NULL REFERENCES meals(id), version INTEGER NOT NULL, result_json TEXT NOT NULL, source TEXT NOT NULL, model TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, error_message TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text), UNIQUE(meal_id, version))`,
    `CREATE INDEX IF NOT EXISTS meals_group_date_idx ON meals(group_id, meal_date, created_at)`,
    `CREATE INDEX IF NOT EXISTS analyses_meal_idx ON meal_analyses(meal_id, version DESC)`,
  ];
  await db.batch(statements.map((statement) => db.prepare(statement)));
  await db.prepare(`INSERT INTO user_identities (provider, subject, user_id) SELECT auth_provider, auth_subject, id FROM users ON CONFLICT DO NOTHING`).run();
  await db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(new Date().toISOString()).run();
  await db.prepare(`DELETE FROM oauth_states WHERE expires_at <= ? OR used_at IS NOT NULL`).bind(new Date(Date.now() - 86400000).toISOString()).run();
}

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  authProvider: text("auth_provider").notNull(),
  authSubject: text("auth_subject").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  avatarKey: text("avatar_key"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("users_auth_identity_idx").on(table.authProvider, table.authSubject)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userIdentities = sqliteTable("user_identities", {
  provider: text("provider").notNull(),
  subject: text("subject").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("user_identity_unique_idx").on(table.provider, table.subject)]);

export const guestCredentials = sqliteTable("guest_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id),
  pinSalt: text("pin_salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  iterations: integer("iterations").notNull().default(210000),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const oauthStates = sqliteTable("oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  returnTo: text("return_to").notNull().default("/"),
  bindUserId: text("bind_user_id"),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authAttempts = sqliteTable("auth_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  lockedUntil: text("locked_until"),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const groupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull().references(() => groups.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("member"),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("group_members_unique_idx").on(table.groupId, table.userId)]);

export const inviteCodes = sqliteTable("invite_codes", {
  code: text("code").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const meals = sqliteTable("meals", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id),
  authorId: text("author_id").notNull().references(() => users.id),
  mealDate: text("meal_date").notNull(),
  mealType: text("meal_type").notNull(),
  note: text("note").notNull().default(""),
  imageKey: text("image_key").notNull(),
  analysisStatus: text("analysis_status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("meal_slot_unique_idx").on(table.groupId, table.authorId, table.mealDate, table.mealType)]);

export const mealAnalyses = sqliteTable("meal_analyses", {
  id: text("id").primaryKey(),
  mealId: text("meal_id").notNull().references(() => meals.id),
  version: integer("version").notNull(),
  resultJson: text("result_json").notNull(),
  source: text("source").notNull(),
  model: text("model").notNull(),
  confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("meal_analysis_version_idx").on(table.mealId, table.version)]);

import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const crmRoleValues = ["manager", "sales_rep", "medical_rep"] as const;

export const crmProfiles = mysqlTable("crmProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  crmRole: mysqlEnum("crmRole", crmRoleValues).default("sales_rep").notNull(),
  territory: varchar("territory", { length: 255 }).default("غير معين").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmProfile = typeof crmProfiles.$inferSelect;
export type InsertCrmProfile = typeof crmProfiles.$inferInsert;

export const crmTeamInvites = mysqlTable("crmTeamInvites", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  crmRole: mysqlEnum("crmRole", crmRoleValues).notNull(),
  territory: varchar("territory", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "revoked"]).default("pending").notNull(),
  inviteCode: varchar("inviteCode", { length: 96 }).notNull().unique(),
  invitedByUserId: int("invitedByUserId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const crmTerritoryBoundaries = mysqlTable("crmTerritoryBoundaries", {
  id: int("id").autoincrement().primaryKey(),
  territoryId: varchar("territoryId", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  state: varchar("state", { length: 255 }).notNull(),
  city: varchar("city", { length: 255 }).notNull(),
  centerLatitude: varchar("centerLatitude", { length: 32 }).notNull(),
  centerLongitude: varchar("centerLongitude", { length: 32 }).notNull(),
  radiusMeters: int("radiusMeters").notNull(),
  boundaryNotes: text("boundaryNotes"),
  updatedByUserId: int("updatedByUserId").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const crmCentralNotifications = mysqlTable("crmCentralNotifications", {
  id: int("id").autoincrement().primaryKey(),
  recipientUserId: int("recipientUserId"),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  kind: mysqlEnum("kind", ["plan", "visit", "alert", "team"]).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const crmDutyLocationPoints = mysqlTable("crmDutyLocationPoints", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  accuracyMeters: int("accuracyMeters"),
  speedMetersPerSecond: varchar("speedMetersPerSecond", { length: 32 }),
  source: mysqlEnum("source", ["foreground", "background"]).notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});

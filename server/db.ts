import { desc, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { crmCentralNotifications, crmDutyLocationPoints, crmProfiles, crmTeamInvites, crmTerritoryBoundaries, type CrmProfile, type InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getOrCreateCrmProfile(userId: number, isSystemAdmin: boolean): Promise<CrmProfile | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(crmProfiles).where(eq(crmProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(crmProfiles).values({
    userId,
    crmRole: isSystemAdmin ? "manager" : "sales_rep",
    territory: isSystemAdmin ? "كل المناطق" : "غير معين",
  });
  const created = await db.select().from(crmProfiles).where(eq(crmProfiles.userId, userId)).limit(1);
  return created[0];
}

export async function listCrmMembers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: crmProfiles.crmRole,
      territory: crmProfiles.territory,
    })
    .from(users)
    .leftJoin(crmProfiles, eq(users.id, crmProfiles.userId));
}

export async function updateCrmMemberRole(userId: number, role: "manager" | "sales_rep" | "medical_rep", territory?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const profile = await getOrCreateCrmProfile(userId, false);
  if (!profile) throw new Error("Unable to create CRM profile");
  await db.update(crmProfiles).set({ crmRole: role, ...(territory ? { territory } : {}) }).where(eq(crmProfiles.userId, userId));
  return getOrCreateCrmProfile(userId, role === "manager");
}

export async function listCrmInvites() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(crmTeamInvites);
}

export async function createCrmInvite(input: { email: string; crmRole: "manager" | "sales_rep" | "medical_rep"; territory: string; invitedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const inviteCode = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(crmTeamInvites).values({ ...input, inviteCode, expiresAt });
  return { inviteCode, expiresAt };
}

export async function listTerritoryBoundaries() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(crmTerritoryBoundaries);
}

export async function upsertTerritoryBoundary(input: { territoryId: string; name: string; state: string; city: string; centerLatitude: string; centerLongitude: string; radiusMeters: number; boundaryNotes?: string; updatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(crmTerritoryBoundaries).values(input).onDuplicateKeyUpdate({
    set: { name: input.name, state: input.state, city: input.city, centerLatitude: input.centerLatitude, centerLongitude: input.centerLongitude, radiusMeters: input.radiusMeters, boundaryNotes: input.boundaryNotes, updatedByUserId: input.updatedByUserId },
  });
  return db.select().from(crmTerritoryBoundaries).where(eq(crmTerritoryBoundaries.territoryId, input.territoryId)).limit(1);
}

export async function listCentralNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(crmCentralNotifications).where(eq(crmCentralNotifications.recipientUserId, userId));
}

export async function createCentralNotification(input: { recipientUserId?: number; title: string; body: string; kind: "plan" | "visit" | "alert" | "team"; createdByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(crmCentralNotifications).values({ ...input, recipientUserId: input.recipientUserId ?? null });
}

export async function recordDutyLocation(input: { userId: number; latitude: string; longitude: string; accuracyMeters?: number; speedMetersPerSecond?: string; source: "foreground" | "background"; capturedAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(crmDutyLocationPoints).values(input);
}

export async function getMyDutyRoute(userId: number, since: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(crmDutyLocationPoints).where(gte(crmDutyLocationPoints.capturedAt, since)).orderBy(crmDutyLocationPoints.capturedAt);
}

export async function getLiveDutyLocations(since: Date) {
  const db = await getDb();
  if (!db) return [];
  const points = await db.select({ userId: crmDutyLocationPoints.userId, latitude: crmDutyLocationPoints.latitude, longitude: crmDutyLocationPoints.longitude, accuracyMeters: crmDutyLocationPoints.accuracyMeters, speedMetersPerSecond: crmDutyLocationPoints.speedMetersPerSecond, source: crmDutyLocationPoints.source, capturedAt: crmDutyLocationPoints.capturedAt, name: users.name, crmRole: crmProfiles.crmRole, territory: crmProfiles.territory }).from(crmDutyLocationPoints).leftJoin(users, eq(crmDutyLocationPoints.userId, users.id)).leftJoin(crmProfiles, eq(crmDutyLocationPoints.userId, crmProfiles.userId)).where(gte(crmDutyLocationPoints.capturedAt, since)).orderBy(desc(crmDutyLocationPoints.capturedAt));
  const latestByUser = new Map<number, (typeof points)[number]>();
  for (const point of points) if (!latestByUser.has(point.userId)) latestByUser.set(point.userId, point);
  return [...latestByUser.values()];
}

import { describe, expect, it } from "vitest";
import {
  isReusableDutySession,
  latestPositionsByProfile,
  toDutyLocationPointInsert,
  type DutyPoint,
  type DutyPointRow,
} from "../lib/duty-tracking-payload";

const point = (overrides: Partial<DutyPoint> = {}): DutyPoint => ({
  latitude: 15.5,
  longitude: 32.5,
  accuracyMeters: 12.4,
  speedMetersPerSecond: 3.456,
  capturedAt: "2026-08-14T08:05:00.000Z",
  source: "foreground",
  ...overrides,
});

describe("toDutyLocationPointInsert", () => {
  it("maps a queued point to the duty_location_points row shape", () => {
    expect(toDutyLocationPointInsert("session-1", "profile-1", "company-1", point())).toEqual({
      session_id: "session-1",
      profile_id: "profile-1",
      company_id: "company-1",
      latitude: 15.5,
      longitude: 32.5,
      accuracy_meters: 12,
      speed_meters_per_second: 3.46,
      source: "foreground",
      captured_at: "2026-08-14T08:05:00.000Z",
    });
  });

  it("rounds accuracy to the nearest metre and speed to two decimal places", () => {
    const row = toDutyLocationPointInsert("s", "p", "company-1", point({ accuracyMeters: 9.5, speedMetersPerSecond: 1.005 }));
    expect(row.accuracy_meters).toBe(10);
    expect(row.speed_meters_per_second).toBe(1);
  });

  it("nulls out accuracy and speed when the device did not report them", () => {
    const row = toDutyLocationPointInsert("s", "p", "company-1", point({ accuracyMeters: null, speedMetersPerSecond: null }));
    expect(row.accuracy_meters).toBeNull();
    expect(row.speed_meters_per_second).toBeNull();
  });

  it("preserves the background source", () => {
    expect(toDutyLocationPointInsert("s", "p", "company-1", point({ source: "background" })).source).toBe("background");
  });
});

describe("isReusableDutySession", () => {
  it("reuses an active session with no end date", () => {
    expect(isReusableDutySession({ id: "s1", is_active: true, ended_at: null })).toBe(true);
  });

  it("does not reuse a session that has ended", () => {
    expect(isReusableDutySession({ id: "s1", is_active: true, ended_at: "2026-08-14T09:00:00.000Z" })).toBe(false);
  });

  it("does not reuse a session marked inactive", () => {
    expect(isReusableDutySession({ id: "s1", is_active: false, ended_at: null })).toBe(false);
  });

  it("does not reuse when there is no prior session at all", () => {
    expect(isReusableDutySession(null)).toBe(false);
    expect(isReusableDutySession(undefined)).toBe(false);
  });
});

describe("latestPositionsByProfile", () => {
  const row = (profileId: string, capturedAt: string): DutyPointRow => ({
    profile_id: profileId,
    latitude: 15.5,
    longitude: 32.5,
    captured_at: capturedAt,
    profiles: { full_name: "مندوب", role_key: "sales_rep", territory_label: "الخرطوم" },
  });

  it("keeps only the first (most recent) row per profile, given rows ordered newest-first", () => {
    const rows = [row("a", "2026-08-14T08:05:00.000Z"), row("a", "2026-08-14T08:00:00.000Z"), row("b", "2026-08-14T08:03:00.000Z")];
    const result = latestPositionsByProfile(rows);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.profile_id === "a")?.captured_at).toBe("2026-08-14T08:05:00.000Z");
    expect(result.find((item) => item.profile_id === "b")?.captured_at).toBe("2026-08-14T08:03:00.000Z");
  });

  it("returns an empty list for no rows", () => {
    expect(latestPositionsByProfile([])).toEqual([]);
  });
});

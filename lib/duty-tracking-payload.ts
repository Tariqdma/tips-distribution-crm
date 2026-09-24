// Pure mapping/decision logic for duty tracking, kept free of react-native and crm-store
// imports so it can be loaded by vitest. lib/duty-tracker.ts is the react-native-bound caller.

export type DutyPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  speedMetersPerSecond?: number | null;
  capturedAt: string;
  source: "foreground" | "background";
};

export type DutyLocationPointInsert = {
  session_id: string;
  profile_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  speed_meters_per_second: number | null;
  source: DutyPoint["source"];
  captured_at: string;
};

export function toDutyLocationPointInsert(sessionId: string, profileId: string, point: DutyPoint): DutyLocationPointInsert {
  return {
    session_id: sessionId,
    profile_id: profileId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy_meters: point.accuracyMeters != null ? Math.round(point.accuracyMeters) : null,
    speed_meters_per_second: point.speedMetersPerSecond != null ? Number(point.speedMetersPerSecond.toFixed(2)) : null,
    source: point.source,
    captured_at: point.capturedAt,
  };
}

export type DutySessionRow = { id: string; is_active: boolean; ended_at: string | null };

export function isReusableDutySession(session: DutySessionRow | null | undefined): session is DutySessionRow {
  return Boolean(session && session.is_active && session.ended_at === null);
}

export type DutyPointProfile = { full_name: string | null; role_key: string | null; territory_label: string | null } | null;
export type DutyPointRow = { profile_id: string; latitude: number | string; longitude: number | string; captured_at: string; profiles: DutyPointProfile };

// Rows arrive ordered by captured_at desc (server-side query), so the first row seen per
// profile_id is that profile's latest known position.
export function latestPositionsByProfile(rows: readonly DutyPointRow[]): DutyPointRow[] {
  const seen = new Set<string>();
  const latest: DutyPointRow[] = [];
  for (const row of rows) {
    if (seen.has(row.profile_id)) continue;
    seen.add(row.profile_id);
    latest.push(row);
  }
  return latest;
}

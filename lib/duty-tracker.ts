import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase-client";
import type { DutyPoint } from "@/lib/duty-tracking-payload";

export const DUTY_LOCATION_TASK = "tips-crm-duty-location";
const DUTY_STATE_KEY = "tips-crm-duty-tracking-state";
const DUTY_QUEUE_KEY = "tips-crm-duty-tracking-queue";

export type { DutyPoint } from "@/lib/duty-tracking-payload";
export type DutyTrackingState = { enabled: boolean; startedAt?: string; lastPoint?: DutyPoint; backgroundEnabled: boolean };

let foregroundSubscription: Location.LocationSubscription | null = null;
const listeners = new Set<(point: DutyPoint) => void>();

let cachedSessionId: string | null = null;
let sessionPromise: Promise<string> | null = null;

// The session and its points go through RPCs: tips_crm is not exposed over the
// REST API, and the server resolves the company from the caller's membership.
async function startDutySession(): Promise<string> {
  if (!supabase) throw new Error("Supabase غير مهيأ.");
  const { data, error } = await supabase.rpc("tips_crm_start_duty_session");
  if (error || !data) throw error ?? new Error("تعذر إنشاء جلسة دوام.");
  return data as string;
}

// Cached for the life of the tracking session so GPS points, which arrive frequently, do not
// each ask for the session first.
function ensureDutySessionId(): Promise<string> {
  if (cachedSessionId) return Promise.resolve(cachedSessionId);
  if (!sessionPromise) {
    sessionPromise = startDutySession()
      .then((id) => { cachedSessionId = id; return id; })
      .finally(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

async function closeDutySession() {
  const hadSession = Boolean(cachedSessionId);
  cachedSessionId = null;
  if (!hadSession || !supabase) return;
  try {
    await supabase.rpc("tips_crm_end_duty_session");
  } catch {
    // تبقى الجلسة نشطة في القاعدة وستُعاد تهيئتها عند بدء الدوام التالي.
  }
}

function normalise(location: Location.LocationObject, source: DutyPoint["source"]): DutyPoint {
  return { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracyMeters: location.coords.accuracy, speedMetersPerSecond: location.coords.speed, capturedAt: new Date(location.timestamp).toISOString(), source };
}

async function persistState(state: DutyTrackingState) {
  await AsyncStorage.setItem(DUTY_STATE_KEY, JSON.stringify(state));
}

export async function getDutyTrackingState(): Promise<DutyTrackingState> {
  const raw = await AsyncStorage.getItem(DUTY_STATE_KEY);
  return raw ? JSON.parse(raw) as DutyTrackingState : { enabled: false, backgroundEnabled: false };
}

async function recordDutyPoints(points: DutyPoint[]) {
  if (!supabase) throw new Error("لا توجد جلسة مستخدم نشطة.");
  await ensureDutySessionId();
  const { error } = await supabase.rpc("tips_crm_record_duty_points", { points });
  if (error) throw error;
}

async function insertDutyPoint(point: DutyPoint) {
  await recordDutyPoints([point]);
}

async function uploadPoint(point: DutyPoint) {
  try {
    await insertDutyPoint(point);
  } catch {
    const queued = JSON.parse((await AsyncStorage.getItem(DUTY_QUEUE_KEY)) ?? "[]") as DutyPoint[];
    await AsyncStorage.setItem(DUTY_QUEUE_KEY, JSON.stringify([...queued.slice(-80), point]));
  }
}

// Batched rather than one round trip per queued point (contrast the live path above, which is
// necessarily one insert per point as it arrives): a reconnect after an offline stretch can carry
// up to 80 queued points, and turning that into 80 sequential requests over poor mobile data is
// worse than one insert that either lands together or stays queued together.
export async function flushQueuedDutyPoints() {
  const queued = JSON.parse((await AsyncStorage.getItem(DUTY_QUEUE_KEY)) ?? "[]") as DutyPoint[];
  if (!queued.length) return;
  try {
    await recordDutyPoints(queued);
    await AsyncStorage.removeItem(DUTY_QUEUE_KEY);
  } catch {
    // تبقى النقاط محفوظة محلياً لإرسالها عند الاتصال التالي.
  }
}

async function publishPoint(point: DutyPoint) {
  const current = await getDutyTrackingState();
  await persistState({ ...current, enabled: true, lastPoint: point });
  listeners.forEach((listener) => listener(point));
  void uploadPoint(point);
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(DUTY_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations ?? [];
    const latest = locations.at(-1);
    if (latest) await publishPoint(normalise(latest, "background"));
  });
}

export function subscribeToDutyPoints(listener: (point: DutyPoint) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function startDirectDutyTracking() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") throw new Error("لم يتم السماح باستخدام الموقع أثناء الدوام.");
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) throw new Error("يرجى تشغيل خدمات الموقع ثم المحاولة.");

  let backgroundEnabled = false;
  if (Platform.OS !== "web") {
    const background = await Location.requestBackgroundPermissionsAsync();
    backgroundEnabled = background.status === "granted";
    if (backgroundEnabled && !(await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(DUTY_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60000,
        distanceInterval: 80,
        deferredUpdatesDistance: 120,
        deferredUpdatesInterval: 120000,
        foregroundService: { notificationTitle: "Tips CRM يتابع الدوام", notificationBody: "يتم تحديث موقع الدوام للإدارة. يمكنك إيقافه من التطبيق." },
      });
    }
  }

  void ensureDutySessionId().catch(() => undefined);

  if (!foregroundSubscription) {
    foregroundSubscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 40 }, (location) => { void publishPoint(normalise(location, "foreground")); });
  }
  const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000, requiredAccuracy: 250 });
  if (lastKnown) await publishPoint(normalise(lastKnown, "foreground"));
  await persistState({ enabled: true, startedAt: new Date().toISOString(), backgroundEnabled, lastPoint: lastKnown ? normalise(lastKnown, "foreground") : undefined });
  void flushQueuedDutyPoints();
  return { backgroundEnabled };
}

export async function stopDirectDutyTracking() {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  if (Platform.OS !== "web" && await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(DUTY_LOCATION_TASK);
  const previous = await getDutyTrackingState();
  await persistState({ enabled: false, backgroundEnabled: false, lastPoint: previous.lastPoint });
  await closeDutySession();
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { createTRPCClient } from "@/lib/trpc";

export const DUTY_LOCATION_TASK = "tips-crm-duty-location";
const DUTY_STATE_KEY = "tips-crm-duty-tracking-state";
const DUTY_QUEUE_KEY = "tips-crm-duty-tracking-queue";

export type DutyPoint = { latitude: number; longitude: number; accuracyMeters?: number | null; speedMetersPerSecond?: number | null; capturedAt: string; source: "foreground" | "background" };
export type DutyTrackingState = { enabled: boolean; startedAt?: string; lastPoint?: DutyPoint; backgroundEnabled: boolean };

let foregroundSubscription: Location.LocationSubscription | null = null;
const listeners = new Set<(point: DutyPoint) => void>();

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

async function uploadPoint(point: DutyPoint) {
  try {
    const client = createTRPCClient();
    await client.tracking.record.mutate({ latitude: point.latitude, longitude: point.longitude, accuracyMeters: point.accuracyMeters ?? undefined, speedMetersPerSecond: point.speedMetersPerSecond ?? undefined, source: point.source, capturedAt: new Date(point.capturedAt) });
  } catch {
    const queued = JSON.parse((await AsyncStorage.getItem(DUTY_QUEUE_KEY)) ?? "[]") as DutyPoint[];
    await AsyncStorage.setItem(DUTY_QUEUE_KEY, JSON.stringify([...queued.slice(-80), point]));
  }
}

export async function flushQueuedDutyPoints() {
  const queued = JSON.parse((await AsyncStorage.getItem(DUTY_QUEUE_KEY)) ?? "[]") as DutyPoint[];
  if (!queued.length) return;
  const client = createTRPCClient();
  try {
    for (const point of queued) await client.tracking.record.mutate({ latitude: point.latitude, longitude: point.longitude, accuracyMeters: point.accuracyMeters ?? undefined, speedMetersPerSecond: point.speedMetersPerSecond ?? undefined, source: point.source, capturedAt: new Date(point.capturedAt) });
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
}

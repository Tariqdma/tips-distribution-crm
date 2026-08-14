import type { DutyTrackPoint } from "@/lib/crm-store";

export function appendDutyPoint(path: DutyTrackPoint[], point: DutyTrackPoint, maxPoints = 100) {
  return [...path.slice(-(maxPoints - 1)), point];
}

export function trackingFreshness(capturedAt: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(capturedAt).getTime()) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes === 1) return "منذ دقيقة";
  return `منذ ${minutes} دقائق`;
}

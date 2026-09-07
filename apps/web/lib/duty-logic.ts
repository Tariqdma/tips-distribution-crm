import type { DutyTrackPoint } from "@/lib/crm-store";

export type GeoPoint = { latitude: number; longitude: number };
export type TerritoryBoundaryLike = {
  centerLatitude: string;
  centerLongitude: string;
  radiusMeters: number;
  polygonPoints?: GeoPoint[];
};

const EARTH_RADIUS_METERS = 6_371_000;

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceInMeters(first: GeoPoint, second: GeoPoint) {
  const latitudeDelta = degreesToRadians(second.latitude - first.latitude);
  const longitudeDelta = degreesToRadians(second.longitude - first.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(degreesToRadians(first.latitude)) * Math.cos(degreesToRadians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ray-casting test for an administrative polygon. */
export function isPointInPolygon(point: GeoPoint, polygon: GeoPoint[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = ((currentPoint.latitude > point.latitude) !== (previousPoint.latitude > point.latitude))
      && point.longitude < ((previousPoint.longitude - currentPoint.longitude) * (point.latitude - currentPoint.latitude))
        / (previousPoint.latitude - currentPoint.latitude) + currentPoint.longitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isInsideTerritory(point: GeoPoint, boundary: TerritoryBoundaryLike) {
  const polygon = boundary.polygonPoints?.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) ?? [];
  if (polygon.length >= 3) return isPointInPolygon(point, polygon);
  const center = { latitude: Number(boundary.centerLatitude), longitude: Number(boundary.centerLongitude) };
  if (!Number.isFinite(center.latitude) || !Number.isFinite(center.longitude) || boundary.radiusMeters <= 0) return false;
  return distanceInMeters(point, center) <= boundary.radiusMeters;
}

export function appendDutyPoint(path: DutyTrackPoint[], point: DutyTrackPoint, maxPoints = 100) {
  return [...path.slice(-(maxPoints - 1)), point];
}

export function trackingFreshness(capturedAt: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(capturedAt).getTime()) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes === 1) return "منذ دقيقة";
  return `منذ ${minutes} دقائق`;
}

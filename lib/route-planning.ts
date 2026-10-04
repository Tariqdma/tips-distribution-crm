import { distanceInMeters, type GeoPoint } from "@/lib/duty-logic";

type Located = { latitude?: number; longitude?: number };

export function locationOf(place: Located | undefined): GeoPoint | null {
  if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;
  return { latitude: place.latitude as number, longitude: place.longitude as number };
}

/**
 * Nearest-first order for the visits still to do. Visits whose place has no
 * coordinates keep their original order after the located ones; done visits
 * stay at the end.
 */
export function orderByDistance<T>(items: T[], origin: GeoPoint, placeOf: (item: T) => Located | undefined, isDone: (item: T) => boolean) {
  const ranked = items.map((item, index) => {
    const place = locationOf(placeOf(item));
    return { item, index, done: isDone(item), distance: place ? distanceInMeters(origin, place) : Number.POSITIVE_INFINITY };
  });
  ranked.sort((first, second) => {
    if (first.done !== second.done) return first.done ? 1 : -1;
    if (first.distance !== second.distance) return first.distance - second.distance;
    return first.index - second.index;
  });
  return ranked.map((entry) => entry.item);
}

export function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} م`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} كم`;
}

export function directionsUrl(place: GeoPoint) {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
}

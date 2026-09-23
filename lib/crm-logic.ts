import { isInsideTerritory, type TerritoryBoundaryLike } from "./duty-logic";

export type CapturedLocation = { latitude: number; longitude: number; accuracy?: number | null };

export function isLocationAcceptable(accuracy: number | null | undefined, maximumAccuracy = 150) {
  return accuracy == null || accuracy <= maximumAccuracy;
}

export function isLocationWithinAssignedTerritory(location: CapturedLocation, boundary: TerritoryBoundaryLike | undefined, maximumAccuracy = 150) {
  return isLocationAcceptable(location.accuracy, maximumAccuracy) && (!boundary || isInsideTerritory(location, boundary));
}

export function isLocationWithinAssignedTerritories(location: CapturedLocation, boundaries: TerritoryBoundaryLike[], maximumAccuracy = 150) {
  return isLocationAcceptable(location.accuracy, maximumAccuracy) && (boundaries.length === 0 || boundaries.some((boundary) => isInsideTerritory(location, boundary)));
}

export function visitOutcomeFromAccuracy(accuracy: number | null | undefined) {
  return isLocationAcceptable(accuracy) ? "مكتملة" : "تحتاج مراجعة";
}

export function isLocationAcceptable(accuracy: number | null | undefined, maximumAccuracy = 150) {
  return accuracy == null || accuracy <= maximumAccuracy;
}

export function visitOutcomeFromAccuracy(accuracy: number | null | undefined) {
  return isLocationAcceptable(accuracy) ? "مكتملة" : "تحتاج مراجعة";
}

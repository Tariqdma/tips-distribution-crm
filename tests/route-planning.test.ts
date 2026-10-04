import { describe, expect, it } from "vitest";
import { directionsUrl, formatDistance, orderByDistance } from "@/lib/route-planning";

const origin = { latitude: 15.55, longitude: 32.53 };
const places: Record<string, { latitude?: number; longitude?: number }> = {
  far: { latitude: 15.65, longitude: 32.53 },
  near: { latitude: 15.551, longitude: 32.531 },
  unknown: {},
  doneNear: { latitude: 15.5501, longitude: 32.5301 },
};
type Item = { id: string; done: boolean };

describe("orderByDistance", () => {
  it("puts nearest pending visits first, unlocated after them and done visits last", () => {
    const items: Item[] = [
      { id: "unknown", done: false },
      { id: "doneNear", done: true },
      { id: "far", done: false },
      { id: "near", done: false },
    ];
    const ordered = orderByDistance(items, origin, (item) => places[item.id], (item) => item.done).map((item) => item.id);
    expect(ordered).toEqual(["near", "far", "unknown", "doneNear"]);
  });
});

describe("formatDistance", () => {
  it("formats meters and kilometers", () => {
    expect(formatDistance(4)).toBe("10 م");
    expect(formatDistance(347)).toBe("350 م");
    expect(formatDistance(1530)).toBe("1.5 كم");
    expect(formatDistance(23_400)).toBe("23 كم");
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("directionsUrl", () => {
  it("builds a Google Maps directions link", () => {
    expect(directionsUrl({ latitude: 15.5, longitude: 32.5 })).toBe("https://www.google.com/maps/dir/?api=1&destination=15.5,32.5");
  });
});

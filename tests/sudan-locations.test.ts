import { describe, expect, it } from "vitest";
import { citiesForState, stateForCity, SUDAN_STATES } from "../lib/sudan-locations";

describe("قوائم ولايات ومدن السودان", () => {
  it("تحتوي على الولايات الثماني عشرة", () => {
    expect(SUDAN_STATES).toHaveLength(18);
  });

  it("تعرض مدينة بورتسودان تحت ولاية البحر الأحمر", () => {
    expect(citiesForState("ولاية البحر الأحمر")).toContain("بورتسودان");
  });

  it("تتعرف على ولاية المدينة المختارة", () => {
    expect(stateForCity("الخرطوم بحري")).toBe("ولاية الخرطوم");
  });
});

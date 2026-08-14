import { describe, expect, it } from "vitest";
import { appendDutyPoint, trackingFreshness } from "../lib/duty-logic";

const point = (minute: number) => ({ latitude: 15.5, longitude: 32.5, capturedAt: new Date(Date.UTC(2026, 7, 14, 8, minute)).toISOString(), source: "foreground" as const });

describe("مسار الدوام المباشر", () => {
  it("يحتفظ بأحدث نقاط المسار ضمن الحد المطلوب", () => {
    const route = appendDutyPoint([point(0), point(1)], point(2), 2);
    expect(route).toHaveLength(2);
    expect(route[0].capturedAt).toBe(point(1).capturedAt);
    expect(route[1].capturedAt).toBe(point(2).capturedAt);
  });

  it("يعرض حالة تحديث مفهومة للإدارة", () => {
    const now = new Date(Date.UTC(2026, 7, 14, 8, 5));
    expect(trackingFreshness(point(5).capturedAt, now)).toBe("الآن");
    expect(trackingFreshness(point(4).capturedAt, now)).toBe("منذ دقيقة");
    expect(trackingFreshness(point(1).capturedAt, now)).toBe("منذ 4 دقائق");
  });
});

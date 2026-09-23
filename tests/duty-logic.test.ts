import { describe, expect, it } from "vitest";
import { appendDutyPoint, isInsideTerritory, isPointInPolygon, trackingFreshness } from "../lib/duty-logic";
import { isLocationWithinAssignedTerritory } from "../lib/crm-logic";

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

  it("يتحقق من النقاط داخل وخارج المضلع المرسوم", () => {
    const polygon = [{ latitude: 15.55, longitude: 32.53 }, { latitude: 15.55, longitude: 32.55 }, { latitude: 15.57, longitude: 32.55 }, { latitude: 15.57, longitude: 32.53 }];
    expect(isPointInPolygon({ latitude: 15.56, longitude: 32.54 }, polygon)).toBe(true);
    expect(isPointInPolygon({ latitude: 15.58, longitude: 32.54 }, polygon)).toBe(false);
  });

  it("يعتمد المضلع عند وجوده ويعود للنطاق الدائري عند غيابه", () => {
    const polygon = [{ latitude: 15.55, longitude: 32.53 }, { latitude: 15.55, longitude: 32.55 }, { latitude: 15.57, longitude: 32.55 }, { latitude: 15.57, longitude: 32.53 }];
    expect(isInsideTerritory({ latitude: 15.58, longitude: 32.54 }, { centerLatitude: "15.56", centerLongitude: "32.54", radiusMeters: 5000, polygonPoints: polygon })).toBe(false);
    expect(isInsideTerritory({ latitude: 15.5581, longitude: 32.5372 }, { centerLatitude: "15.5581", centerLongitude: "32.5372", radiusMeters: 1000 })).toBe(true);
  });

  it("يجمع بين دقة GPS وحدود المنطقة قبل قبول الموقع", () => {
    const polygon = [{ latitude: 15.55, longitude: 32.53 }, { latitude: 15.55, longitude: 32.55 }, { latitude: 15.57, longitude: 32.55 }, { latitude: 15.57, longitude: 32.53 }];
    const boundary = { centerLatitude: "15.56", centerLongitude: "32.54", radiusMeters: 5000, polygonPoints: polygon };
    expect(isLocationWithinAssignedTerritory({ latitude: 15.56, longitude: 32.54, accuracy: 25 }, boundary)).toBe(true);
    expect(isLocationWithinAssignedTerritory({ latitude: 15.56, longitude: 32.54, accuracy: 250 }, boundary)).toBe(false);
  });
});

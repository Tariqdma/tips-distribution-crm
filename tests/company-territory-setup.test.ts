import { describe, expect, it } from "vitest";
import { buildCompanyTerritorySetup, validateCompanyTerritory } from "../server/company-territory-setup";

const validTerritory = { name: "وسط الخرطوم", state: "ولاية الخرطوم", city: "الخرطوم", centerLatitude: 15.5581, centerLongitude: 32.5372, radiusMeters: 2500, polygonPoints: [] };

describe("company territory setup", () => {
  it("accepts a complete circular territory and rejects incomplete polygons", () => {
    expect(validateCompanyTerritory(validTerritory)).toBeNull();
    expect(validateCompanyTerritory({ ...validTerritory, polygonPoints: [{ latitude: 15.5, longitude: 32.5 }] })).toContain("ثلاث نقاط");
  });

  it("summarizes active territory readiness and team assignments", () => {
    const setup = buildCompanyTerritorySetup([{ client_key: "area-1", name: "وسط الخرطوم", state: "ولاية الخرطوم", city: "الخرطوم", center_latitude: 15.5581, center_longitude: 32.5372, radius_meters: 2500, polygon_points: [{ latitude: 15.55, longitude: 32.53 }, { latitude: 15.56, longitude: 32.54 }, { latitude: 15.57, longitude: 32.53 }], assigned_member_count: 2, is_boundary_complete: true }]);
    expect(setup.territoryCount).toBe(1);
    expect(setup.assignedTerritoryCount).toBe(1);
    expect(setup.territories[0].polygonPoints).toHaveLength(3);
  });
});

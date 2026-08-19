import { describe, expect, it } from "vitest";
import { validateCompanyOperationalSetup } from "../server/company-setup";

const validInput = { companyName: "شركة الاختبار", legalName: "", activityType: "توزيع", businessPhone: "", supportEmail: "", workingDays: ["sunday"], workdayStartsAt: "08:00", workdayEndsAt: "17:00", gpsTrackingRequired: true, outsideVisitTracking: false, geofenceEnforcement: true };

describe("company operational setup validation", () => {
  it("accepts complete operational setup", () => expect(validateCompanyOperationalSetup(validInput)).toBeNull());
  it("requires the operational essentials", () => expect(validateCompanyOperationalSetup({ ...validInput, activityType: "", workingDays: [] })).toContain("طبيعة"));
  it("rejects an invalid time window", () => expect(validateCompanyOperationalSetup({ ...validInput, workdayStartsAt: "17:00", workdayEndsAt: "08:00" })).toContain("الدوام"));
});

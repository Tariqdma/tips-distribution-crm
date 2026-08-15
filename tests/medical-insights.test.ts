import { describe, expect, it } from "vitest";
import { buildMedicalCoverage } from "../lib/medical-insights";

describe("medical coverage", () => {
  it("يجمع التفاعل الطبي حسب المندوب والمنطقة والتخصص مع الاهتمام والمتابعة", () => {
    const rows = buildMedicalCoverage({
      today: "2026-08-15",
      members: [{ id: "medical-1", name: "د. أحمد", initials: "أ", role: "مندوب طبي", type: "طبي", territory: "الخرطوم" }],
      accounts: [{ id: "doctor-1", name: "د. سارة", type: "طبيب", specialty: "باطنية", state: "ولاية الخرطوم", area: "الرياض", city: "الخرطوم", address: "", contact: "", lastVisit: "", priority: "عالية", initials: "س", accent: "#000" }],
      visits: [
        { id: "v1", accountId: "doctor-1", date: "2026-08-10", time: "", status: "مكتملة", medicalInteractionType: "زيارة حضورية", doctorInterest: "مرتفع", promotedProduct: "منتج أ", followUpDate: "2026-08-14" },
        { id: "v2", accountId: "doctor-1", date: "2026-08-11", time: "", status: "مكتملة", medicalInteractionType: "اتصال هاتفي", doctorInterest: "طلب معلومات", promotedProduct: "منتج أ" },
      ],
    });
    expect(rows).toEqual([expect.objectContaining({ repName: "د. أحمد", territory: "ولاية الخرطوم · الخرطوم", specialty: "باطنية", visits: 2, inPersonVisits: 1, remoteVisits: 1, highInterest: 1, requestedInfo: 1, dueFollowUps: 1, promotedProducts: ["منتج أ"] })]);
  });
});

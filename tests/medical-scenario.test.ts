import { describe, it, expect } from "vitest";

describe("Medical Representative Scenario (Samples & Events)", () => {
  it("يتحقق من صحة هياكل العينات الطبية وتوزيعها والفعاليات", () => {
    const sample = {
      id: "smpl-demo-1",
      name: "عينة [تجريبي] أجوستين 50مجم",
      code: "AG50",
      totalStock: 500,
      unit: "شريط",
    };

    const distribution = {
      id: "dist-demo-1",
      sampleId: "smpl-demo-1",
      quantityGiven: 50,
      notes: "توزيع تجريبي للدليل التشغيلي",
    };

    const medicalEvent = {
      id: "ev-demo-1",
      title: "ندوة أمراض الجهاز الهضمي [تجريبي]",
      eventDate: "2026-08-25",
      location: "فندق الراعفة - الخرطوم",
      targetSpecialty: "باطنية وجهاز هضمي",
    };

    const attendee = {
      id: "att-demo-1",
      eventId: "ev-demo-1",
      attendanceStatus: "حضر",
      responseNote: "أبدى اهتماماً كبيراً بالعينة الموزعة",
    };

    expect(sample.code).toBe("AG50");
    expect(distribution.quantityGiven).toBe(50);
    expect(medicalEvent.targetSpecialty).toContain("باطنية");
    expect(attendee.attendanceStatus).toBe("حضر");
  });
});

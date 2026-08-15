import { describe, expect, it } from "vitest";
import { buildFutureWeeks, buildPlanSchedule } from "../lib/plan-scheduling";

describe("plan scheduling", () => {
  it("offers only future Saturday-to-Friday weeks", () => {
    const weeks = buildFutureWeeks(new Date(2026, 7, 15, 9, 0, 0), 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].start.getDay()).toBe(6);
    expect(weeks[0].start.getTime()).toBeGreaterThan(new Date(2026, 7, 15, 9, 0, 0).getTime());
    expect(weeks[0].days).toHaveLength(7);
  });

  it("creates scheduled visit drafts from selected accounts instead of requiring existing visits", () => {
    const [week] = buildFutureWeeks(new Date(2026, 7, 15, 9, 0, 0), 1);
    const result = buildPlanSchedule(week, { "account-1": [week.days[0].id, week.days[3].id], "account-2": [week.days[3].id] });
    expect(result.plannedVisits.map((visit) => visit.accountId)).toEqual(["account-1", "account-1", "account-2"]);
    expect(result.visitIds).toHaveLength(3);
    expect(result.schedule[0].visitIds).toHaveLength(1);
    expect(result.schedule[3].visitIds).toHaveLength(2);
    expect(new Set(result.visitIds).size).toBe(3);
    expect(result.plannedVisits[0].scheduledFor).toBe(week.days[0].dateIso);
    expect(result.plannedVisits[1].scheduledFor).toBe(week.days[3].dateIso);
  });
});

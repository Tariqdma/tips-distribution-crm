export type FuturePlanWeek = {
  id: string;
  label: string;
  start: Date;
  startsOn: string;
  endsOn: string;
  days: Array<{ id: string; label: string; dateLabel: string }>;
};

export type PlannedVisitDraft = {
  id: string;
  accountId: string;
  date: string;
  time: string;
};

export type PlanAssignments = Record<string, string[]>;

const weekdayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const dateText = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("ar-SD", options).replace("،", "");

export function buildFutureWeeks(referenceDate = new Date(), count = 8): FuturePlanWeek[] {
  const firstStart = new Date(referenceDate);
  firstStart.setHours(12, 0, 0, 0);
  const daysUntilSaturday = (6 - firstStart.getDay() + 7) % 7;
  firstStart.setDate(firstStart.getDate() + (daysUntilSaturday === 0 ? 7 : daysUntilSaturday));

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(firstStart);
    start.setDate(start.getDate() + index * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const id = start.toISOString().slice(0, 10);

    return {
      id,
      start,
      startsOn: id,
      endsOn: end.toISOString().slice(0, 10),
      label: `من ${weekdayNames[start.getDay()]} ${dateText(start, { day: "numeric", month: "long" })} إلى ${weekdayNames[end.getDay()]} ${dateText(end, { day: "numeric", month: "long" })}`,
      days: Array.from({ length: 7 }, (_, dayIndex) => {
        const date = new Date(start);
        date.setDate(date.getDate() + dayIndex);
        return {
          id: `${id}-${dayIndex}`,
          label: weekdayNames[date.getDay()],
          dateLabel: dateText(date, { day: "numeric", month: "short" }),
        };
      }),
    };
  });
}

export function buildPlanSchedule(week: FuturePlanWeek, assignments: PlanAssignments) {
  const scheduledAccounts = Object.entries(assignments)
    .flatMap(([accountId, dayIds]) => Array.from(new Set(dayIds)).map((dayId) => ({ accountId, dayId, day: week.days.find((item) => item.id === dayId) })))
    .filter((item): item is { accountId: string; dayId: string; day: FuturePlanWeek["days"][number] } => Boolean(item.day));

  const visitIdFor = (accountId: string, dayId: string) => `plan-${week.id}-${accountId}-${dayId}`;
  const schedule = week.days.map((day) => ({
    ...day,
    visitIds: scheduledAccounts.filter((item) => item.dayId === day.id).map((item) => visitIdFor(item.accountId, item.dayId)),
  }));
  const plannedVisits: PlannedVisitDraft[] = scheduledAccounts.map((item) => ({
    id: visitIdFor(item.accountId, item.dayId),
    accountId: item.accountId,
    date: item.day.dateLabel,
    time: "يحدد عند اعتماد الخطة",
  }));

  return { schedule, plannedVisits, visitIds: plannedVisits.map((visit) => visit.id) };
}

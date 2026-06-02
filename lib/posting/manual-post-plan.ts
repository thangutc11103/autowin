export interface ManualPlanSourceItem {
  videoItemId: string;
  title: string;
}

export interface ManualPlanItem {
  id: string;
  videoItemId: string;
  caption: string;
  scheduledAt: string;
  itemOrder: number;
}

export interface TimeWindow {
  start: string;
  end: string;
}

export const MANUAL_POST_PLANNER_TIMEZONE = "Asia/Bangkok";

export function getPostPlanPresetOptions(selectedCount: number): number[] {
  return Array.from(
    { length: Math.max(0, selectedCount) },
    (_, index) => index + 1,
  );
}

export function buildManualPostPlan(params: {
  items: ManualPlanSourceItem[];
  videosPerDay: number;
  startDate: string;
  timeWindow: TimeWindow;
  timezone?: string;
}): ManualPlanItem[] {
  const itemCount = params.items.length;
  const videosPerDay = Math.trunc(params.videosPerDay);

  if (itemCount === 0) {
    throw new Error("At least one video is required");
  }

  if (videosPerDay < 1 || videosPerDay > itemCount) {
    throw new Error("Videos per day must be less than or equal to selected videos");
  }

  const startMinutes = parseTimeToMinutes(params.timeWindow.start);
  const endMinutes = parseTimeToMinutes(params.timeWindow.end);

  if (endMinutes < startMinutes) {
    throw new Error("Time window end must be after start");
  }

  const timezone = params.timezone || MANUAL_POST_PLANNER_TIMEZONE;

  return params.items.map((item, index) => {
    const dayOffset = Math.floor(index / videosPerDay);
    const slotIndex = index % videosPerDay;
    const postsInThisDay = Math.min(videosPerDay, itemCount - dayOffset * videosPerDay);
    const slotMinute =
      postsInThisDay === 1
        ? startMinutes
        : Math.round(
            startMinutes +
              ((endMinutes - startMinutes) * slotIndex) / (postsInThisDay - 1),
          );
    const localDate = addDays(params.startDate, dayOffset);

    return {
      id: `manual-plan-${item.videoItemId}`,
      videoItemId: item.videoItemId,
      caption: item.title,
      scheduledAt: zonedDateTimeToUtcIso(
        localDate,
        minutesToTime(slotMinute),
        timezone,
      ),
      itemOrder: index,
    };
  });
}

function parseTimeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Time must use HH:mm format");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error("Time must use HH:mm format");
  }

  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function addDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0));
  return date.toISOString().slice(0, 10);
}

function zonedDateTimeToUtcIso(
  dateValue: string,
  timeValue: string,
  timeZone: string,
): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const firstUtc = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(firstUtc, timeZone);
  return new Date(utcGuess.getTime() - secondOffset).toISOString();
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

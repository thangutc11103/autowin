import type { Platform } from "@/types/video";

export const AI_POST_PLANNER_FEATURE = "ai_post_planner";

export const AI_CAPTION_SYSTEM_PROMPT = [
  "Generate social post captions based only on the provided video title.",
  "Do not claim facts that are not present in the title.",
  "Do not mention discounts, medical/legal/financial claims, guarantees, or sensitive attributes unless explicitly present.",
  "Return strict JSON only.",
  "Each caption must be natural, short, and suitable for the selected language.",
  "Do not include scheduledAt unless provided by the server.",
].join("\n");

export type AiPlanPreset = "1_per_day" | "3_per_day" | "5_per_day" | "10_per_day";

export interface TimeWindow {
  start: string;
  end: string;
}

export interface AiCaptionItem {
  videoItemId: string;
  caption: string;
}

export interface PlanItemOverride {
  id: string;
  caption: string;
  scheduledAt: string;
}

export const PRESET_ITEMS_PER_DAY: Record<AiPlanPreset, number> = {
  "1_per_day": 1,
  "3_per_day": 3,
  "5_per_day": 5,
  "10_per_day": 10,
};

const CAPTION_LIMITS: Record<Exclude<Platform, "douyin">, number> = {
  tiktok: 2200,
  facebook: 63206,
  instagram: 2200,
  youtube: 5000,
};

export function getAiMaxItemsPerRequest(): number {
  return readPositiveIntegerEnv("AI_MAX_ITEMS_PER_REQUEST", 50);
}

export function getAiUsageLimits() {
  return {
    userRequestLimit: readPositiveIntegerEnv("AI_DAILY_USER_REQUEST_LIMIT", 30),
    userItemLimit: readPositiveIntegerEnv("AI_DAILY_USER_ITEM_LIMIT", 300),
    tenantRequestLimit: readPositiveIntegerEnv("AI_DAILY_TENANT_REQUEST_LIMIT", 300),
    tenantItemLimit: readPositiveIntegerEnv("AI_DAILY_TENANT_ITEM_LIMIT", 3000),
  };
}

export function getCaptionLimitForTargets(
  targets: Array<{ platform: Exclude<Platform, "douyin"> }>,
): number {
  if (targets.length === 0) return 0;
  return Math.min(...targets.map((target) => CAPTION_LIMITS[target.platform]));
}

export function getItemsPerDay(preset: string | undefined): number {
  if (preset && preset in PRESET_ITEMS_PER_DAY) {
    return PRESET_ITEMS_PER_DAY[preset as AiPlanPreset];
  }

  return PRESET_ITEMS_PER_DAY["1_per_day"];
}

export function buildScheduleSlots(params: {
  itemCount: number;
  itemsPerDay: number;
  startDate: string;
  timezone: string;
  timeWindow: TimeWindow;
}): string[] {
  const itemCount = Math.max(0, params.itemCount);
  const itemsPerDay = Math.max(1, params.itemsPerDay);
  const startMinutes = parseTimeToMinutes(params.timeWindow.start);
  const endMinutes = parseTimeToMinutes(params.timeWindow.end);

  if (endMinutes < startMinutes) {
    throw new Error("Time window end must be after start");
  }

  const slots: string[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const dayOffset = Math.floor(index / itemsPerDay);
    const slotIndex = index % itemsPerDay;
    const slotMinute =
      itemsPerDay === 1
        ? startMinutes
        : Math.round(
            startMinutes +
              ((endMinutes - startMinutes) * slotIndex) / (itemsPerDay - 1),
          );
    const localDate = addDays(params.startDate, dayOffset);
    slots.push(
      zonedDateTimeToUtcIso(localDate, minutesToTime(slotMinute), params.timezone),
    );
  }

  return slots;
}

export function parseAiCaptionResponse(params: {
  raw: string;
  expectedVideoItemIds: string[];
}): AiCaptionItem[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(params.raw);
  } catch {
    throw new Error("AI returned invalid JSON format");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new Error("AI JSON must include an items array");
  }

  const expected = new Set(params.expectedVideoItemIds);
  const seen = new Set<string>();
  const items: AiCaptionItem[] = [];

  for (const item of parsed.items) {
    if (!isRecord(item)) {
      throw new Error("AI item must be an object");
    }

    const videoItemId = typeof item.videoItemId === "string" ? item.videoItemId : "";
    const caption = typeof item.caption === "string" ? item.caption.trim() : "";

    if (!videoItemId || !caption) {
      throw new Error("AI item is missing videoItemId or caption");
    }

    if (!expected.has(videoItemId)) {
      throw new Error(`AI returned extra item ${videoItemId}`);
    }

    if (seen.has(videoItemId)) {
      throw new Error(`AI returned duplicate item ${videoItemId}`);
    }

    seen.add(videoItemId);
    items.push({ videoItemId, caption });
  }

  const missing = params.expectedVideoItemIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`AI response is missing item(s): ${missing.join(", ")}`);
  }

  if (items.length !== params.expectedVideoItemIds.length) {
    throw new Error("AI returned an unexpected number of items");
  }

  return items;
}

export function validatePlanItemOverrides(params: {
  items: PlanItemOverride[];
  captionLimit: number;
  now?: Date;
}): PlanItemOverride[] {
  const now = params.now ?? new Date();
  const seen = new Set<string>();

  return params.items.map((item) => {
    if (!item.id || seen.has(item.id)) {
      throw new Error("Plan item override is missing or duplicated");
    }
    seen.add(item.id);

    const caption = item.caption.trim();
    if (!caption) {
      throw new Error("Caption is required");
    }

    if (caption.length > params.captionLimit) {
      throw new Error(`Caption is too long for the selected platform limit (${params.captionLimit})`);
    }

    const scheduledAt = new Date(item.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error("Invalid scheduledAt value");
    }

    if (scheduledAt.getTime() <= now.getTime()) {
      throw new Error("scheduledAt is in the past");
    }

    return {
      id: item.id,
      caption,
      scheduledAt: scheduledAt.toISOString(),
    };
  });
}

function readPositiveIntegerEnv(key: string, fallback: number): number {
  const value = Number.parseInt(process.env[key] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function zonedDateTimeToUtcIso(dateValue: string, timeValue: string, timeZone: string): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

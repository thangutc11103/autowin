import type { Platform } from "@/types/video";

const CAPTION_LIMITS: Record<Exclude<Platform, "douyin">, number> = {
  tiktok: 2200,
  facebook: 63206,
  instagram: 2200,
  youtube: 5000,
};

export function getCaptionLimitForTargets(
  targets: Array<{ platform: Exclude<Platform, "douyin"> }>,
): number {
  if (targets.length === 0) return 0;
  return Math.min(...targets.map((target) => CAPTION_LIMITS[target.platform]));
}

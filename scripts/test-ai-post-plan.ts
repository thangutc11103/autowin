import assert from "node:assert/strict";
import {
  buildFallbackCaptions,
  buildScheduleSlots,
  getCaptionLimitForTargets,
  parseAiCaptionResponse,
  validatePlanItemOverrides,
} from "../lib/ai/post-plan";

const slots = buildScheduleSlots({
  itemCount: 5,
  itemsPerDay: 3,
  startDate: "2026-06-01",
  timezone: "Asia/Bangkok",
  timeWindow: { start: "09:00", end: "21:00" },
});

assert.equal(slots.length, 5);
assert.equal(slots[0], "2026-06-01T02:00:00.000Z");
assert.equal(slots[1], "2026-06-01T08:00:00.000Z");
assert.equal(slots[2], "2026-06-01T14:00:00.000Z");
assert.equal(slots[3], "2026-06-02T02:00:00.000Z");

const parsed = parseAiCaptionResponse({
  raw: JSON.stringify({
    items: [
      { videoItemId: "video-1", caption: "Caption one" },
      { videoItemId: "video-2", caption: "Caption two" },
    ],
  }),
  expectedVideoItemIds: ["video-1", "video-2"],
});

assert.deepEqual(parsed, [
  { videoItemId: "video-1", caption: "Caption one" },
  { videoItemId: "video-2", caption: "Caption two" },
]);

const fenced = parseAiCaptionResponse({
  raw: '```json\n{"items":[{"videoItemId":"video-1","caption":"Caption one"}]}\n```',
  expectedVideoItemIds: ["video-1"],
});
assert.deepEqual(fenced, [{ videoItemId: "video-1", caption: "Caption one" }]);

assert.deepEqual(
  buildFallbackCaptions({
    language: "vi",
    items: [{ videoItemId: "video-1", title: "Bánh mì giòn tan" }],
  }),
  [{ videoItemId: "video-1", caption: "Bánh mì giòn tan\n\nBạn nghĩ sao về video này?" }],
);

assert.throws(
  () =>
    parseAiCaptionResponse({
      raw: JSON.stringify({ items: [{ videoItemId: "video-1", caption: "Only one" }] }),
      expectedVideoItemIds: ["video-1", "video-2"],
    }),
  /missing/i,
);

assert.throws(
  () =>
    parseAiCaptionResponse({
      raw: JSON.stringify({
        items: [
          { videoItemId: "video-1", caption: "One" },
          { videoItemId: "video-2", caption: "Two" },
          { videoItemId: "video-3", caption: "Extra" },
        ],
      }),
      expectedVideoItemIds: ["video-1", "video-2"],
    }),
  /extra/i,
);

assert.equal(getCaptionLimitForTargets([{ platform: "instagram" }, { platform: "facebook" }]), 2200);

assert.throws(
  () =>
    validatePlanItemOverrides({
      items: [
        {
          id: "item-1",
          caption: "x".repeat(2201),
          scheduledAt: "2026-06-01T02:00:00.000Z",
        },
      ],
      captionLimit: 2200,
      now: new Date("2026-05-29T00:00:00.000Z"),
    }),
  /too long/i,
);

assert.throws(
  () =>
    validatePlanItemOverrides({
      items: [
        {
          id: "item-1",
          caption: "ok",
          scheduledAt: "2026-05-01T02:00:00.000Z",
        },
      ],
      captionLimit: 2200,
      now: new Date("2026-05-29T00:00:00.000Z"),
    }),
  /past/i,
);

console.log("AI post plan helper tests passed");

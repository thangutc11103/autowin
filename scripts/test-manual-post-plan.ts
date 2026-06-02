import assert from "node:assert/strict";
import {
  buildManualPostPlan,
  getPostPlanPresetOptions,
} from "../lib/posting/manual-post-plan";

const threeOnePerDay = buildManualPostPlan({
  items: [
    { videoItemId: "v1", title: "Video 1" },
    { videoItemId: "v2", title: "Video 2" },
    { videoItemId: "v3", title: "Video 3" },
  ],
  videosPerDay: 1,
  startDate: "2026-06-01",
  timeWindow: { start: "09:00", end: "21:00" },
  timezone: "Asia/Bangkok",
});

assert.equal(threeOnePerDay.length, 3);
assert.equal(threeOnePerDay[0].scheduledAt, "2026-06-01T02:00:00.000Z");
assert.equal(threeOnePerDay[1].scheduledAt, "2026-06-02T02:00:00.000Z");
assert.equal(threeOnePerDay[2].scheduledAt, "2026-06-03T02:00:00.000Z");
assert.equal(threeOnePerDay[0].caption, "Video 1");

const threeThreePerDay = buildManualPostPlan({
  items: [
    { videoItemId: "v1", title: "Video 1" },
    { videoItemId: "v2", title: "Video 2" },
    { videoItemId: "v3", title: "Video 3" },
  ],
  videosPerDay: 3,
  startDate: "2026-06-01",
  timeWindow: { start: "09:00", end: "21:00" },
  timezone: "Asia/Bangkok",
});

assert.deepEqual(
  threeThreePerDay.map((item) => item.scheduledAt),
  [
    "2026-06-01T02:00:00.000Z",
    "2026-06-01T08:00:00.000Z",
    "2026-06-01T14:00:00.000Z",
  ],
);

const tenFivePerDay = buildManualPostPlan({
  items: Array.from({ length: 10 }, (_, index) => ({
    videoItemId: `v${index + 1}`,
    title: `Video ${index + 1}`,
  })),
  videosPerDay: 5,
  startDate: "2026-06-01",
  timeWindow: { start: "10:00", end: "18:00" },
  timezone: "Asia/Bangkok",
});

assert.equal(tenFivePerDay.length, 10);
assert.equal(tenFivePerDay[0].scheduledAt.slice(0, 10), "2026-06-01");
assert.equal(tenFivePerDay[4].scheduledAt.slice(0, 10), "2026-06-01");
assert.equal(tenFivePerDay[5].scheduledAt.slice(0, 10), "2026-06-02");
assert.equal(tenFivePerDay[9].scheduledAt.slice(0, 10), "2026-06-02");

assert.deepEqual(getPostPlanPresetOptions(3), [1, 2, 3]);
assert.throws(
  () =>
    buildManualPostPlan({
      items: [{ videoItemId: "v1", title: "Video 1" }],
      videosPerDay: 2,
      startDate: "2026-06-01",
      timeWindow: { start: "09:00", end: "21:00" },
      timezone: "Asia/Bangkok",
    }),
  /less than or equal/i,
);
assert.throws(
  () =>
    buildManualPostPlan({
      items: [{ videoItemId: "v1", title: "Video 1" }],
      videosPerDay: 1,
      startDate: "2026-06-01",
      timeWindow: { start: "21:00", end: "09:00" },
      timezone: "Asia/Bangkok",
    }),
  /after start/i,
);

console.log("Manual post plan helper tests passed");

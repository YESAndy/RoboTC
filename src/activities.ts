import type { Human, Obstacle, Pose, XY } from "./core";

export const ACTIVITIES = [
  "seating",
  "standing",
  "reading",
  "typing",
  "reclining",
  "walking",
] as const;
export type Activity = (typeof ACTIVITIES)[number];
export const ACTIVITY_LABELS: Record<Activity, string> = {
  seating: "Seated",
  standing: "Standing",
  reading: "Reading",
  typing: "Typing",
  reclining: "Reclining",
  walking: "Walking",
};
export const isSeated = (a?: Activity) =>
  ["seating", "reading", "typing", "reclining"].includes(a ?? "");

// Seeded resets are available for experiments. Ordinary resets sample a fresh seed.
export function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function assignActivities(initial: Human[], seed: number): Human[] {
  const random = randomSource(seed);
  return initial.map((base, index) => {
    const activity = ACTIVITIES[Math.floor(random() * ACTIVITIES.length)];
    const lane: XY[] =
      index % 2 === 0
        ? [
            [-1.1, -0.45],
            [0.5, -0.45],
          ]
        : [
            [0.9, -1.25],
            [2.4, -1.25],
          ];
    const position: XY = isSeated(activity)
      ? [index % 2 === 0 ? -1.5 : 1.3, 1.1]
      : activity === "walking"
        ? [...lane[0]]
        : [...base.position];
    return {
      ...structuredClone(base),
      activity,
      position,
      yaw: activity === "walking" ? -Math.PI / 2 : 0,
      activityTime: 0,
      walking: false,
      ...(activity === "walking" ? { walkRoute: lane, walkTarget: 1 } : {}),
    };
  });
}
export function humanBounds(h: Human): Obstacle {
  // Conservative envelopes include hands, bent knees and reclined heads.
  const seated = isSeated(h.activity),
    halfX = 0.4,
    halfY = seated ? 0.65 : h.activity === "walking" ? 0.65 : 0.25;
  const c = Math.abs(Math.cos(h.yaw ?? 0)),
    s = Math.abs(Math.sin(h.yaw ?? 0));
  const x = c * halfX + s * halfY,
    y = s * halfX + c * halfY;
  return [
    h.position[0] - x,
    h.position[1] - y,
    h.position[0] + x,
    h.position[1] + y,
    h.id,
  ];
}
const overlap = (a: Obstacle, b: Obstacle) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export function advanceActivities(
  humans: Human[],
  obstacles: Obstacle[],
  robot: Pose,
  dt: number,
) {
  for (const human of humans) {
    human.activityTime = (human.activityTime ?? 0) + dt;
    human.walking = false;
    if (human.activity !== "walking" || !human.walkRoute?.length) continue;
    // Small substeps also keep externally supplied step(dt) from tunnelling.
    const count = Math.max(1, Math.ceil(dt / 0.0333333334));
    for (let i = 0; i < count; i++) {
      const target = human.walkRoute[human.walkTarget ?? 1];
      let dx = target[0] - human.position[0],
        dy = target[1] - human.position[1],
        distance = Math.hypot(dx, dy);
      if (distance < 0.005) {
        human.walkTarget =
          ((human.walkTarget ?? 1) + 1) % human.walkRoute.length;
        break;
      }
      const length = Math.min((0.22 * dt) / count, distance);
      const candidate: Human = {
        ...human,
        position: [
          human.position[0] + (dx / distance) * length,
          human.position[1] + (dy / distance) * length,
        ],
        yaw: Math.atan2(dy, dx) - Math.PI / 2,
      };
      const box = humanBounds(candidate);
      // Walkers yield to the cart, allowing a stable close-range approach.
      if (
        Math.hypot(
          candidate.position[0] - robot[0],
          candidate.position[1] - robot[1],
        ) < 1.5 ||
        obstacles.some((o) => overlap(box, o)) ||
        humans.some(
          (other) => other !== human && overlap(box, humanBounds(other)),
        )
      )
        break;
      human.position = candidate.position;
      human.yaw = candidate.yaw;
      human.walking = true;
    }
  }
}

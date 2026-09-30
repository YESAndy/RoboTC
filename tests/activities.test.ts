import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "three";
import { Simulation, type Config, type Human } from "../src/core";
import { Office } from "../src/scene";
import {
  ACTIVITIES,
  assignActivities,
  advanceActivities,
  humanBounds,
  isSeated,
} from "../src/activities";
const config = JSON.parse(
  readFileSync(new URL("../public/config.json", import.meta.url), "utf8"),
) as Config;
const base: Human[] = [
  { id: "person 1", position: [-0.05, 1.18] },
  { id: "person 2", position: [1.35, -2.35] },
];
test("resets sample all six activities and seeds reproduce the assignment", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 100; seed++)
    for (const h of assignActivities(base, seed)) seen.add(h.activity!);
  assert.deepEqual([...seen].sort(), [...ACTIVITIES].sort());
  assert.deepEqual(assignActivities(base, 9), assignActivities(base, 9));
  assert.notDeepEqual(assignActivities(base, 9), assignActivities(base, 10));
  const o = new Office(config),
    s = new Simulation(config, o.obstacles, o.humans);
  s.reset(9);
  const expected = structuredClone(s.humans);
  s.setHumanPosition("person 1", -2, 0);
  s.time = 10;
  s.reset(9);
  assert.deepEqual(s.humans, expected);
  assert.equal(s.time, 0);
  assert.equal(s.running, false);
});
test("seated activities get separate chair positions; walkers use clear lanes", () => {
  for (let seed = 0; seed < 50; seed++)
    assignActivities(base, seed).forEach((h, i) => {
      if (isSeated(h.activity))
        assert.deepEqual(h.position, [i === 0 ? -1.5 : 1.3, 1.1]);
      if (h.activity === "walking") assert(h.walkRoute?.length === 2);
    });
});
test("walking advances and reverses, stays clear of furniture and yields to robot", () => {
  const h: Human = {
    id: "walker",
    position: [0, 0],
    activity: "walking",
    walkRoute: [
      [0, 0],
      [1, 0],
    ],
    walkTarget: 1,
  };
  advanceActivities([h], [], [-3, -2, 0], 1);
  assert(Math.abs(h.position[0] - 0.22) < 1e-8);
  for (let i = 0; i < 180; i++) advanceActivities([h], [], [-3, -2, 0], 0.1);
  assert(h.position[0] >= 0 && h.position[0] <= 1);
  assert(h.walkTarget === 0 || h.walkTarget === 1);
  h.position = [0, 0];
  h.walkTarget = 1;
  advanceActivities([h], [], [1, 0, 0], 1);
  assert.equal(h.position[0], 0);
  assert.equal(h.walking, false);
  advanceActivities([h], [[0.7, -1, 0.75, 1, "wall"]], [-3, -2, 0], 1);
  assert(h.position[0] < 0.06);
});
test("Pause freezes human clocks and motion; step keeps oracle collision bounds current", () => {
  const o = new Office(config),
    s = new Simulation(config, o.obstacles, o.humans);
  let seed = 0;
  do {
    s.reset(seed++);
  } while (!s.humans.some((h) => h.activity === "walking"));
  const before = structuredClone(s.humans);
  s.tick(1);
  assert.deepEqual(s.humans, before);
  s.manual();
  s.tick(1 / 30);
  assert(s.humans.every((h) => h.activityTime! > 0));
  for (const h of s.humans)
    assert.deepEqual(
      s.obstacles.find((o) => o[4] === h.id),
      humanBounds(h),
    );
});
test("all visible body parts and activity props fit their navigation envelopes", () => {
  const o = new Office(config);
  for (const activity of ACTIVITIES)
    for (const time of [0, 0.4, 1, 2]) {
      const humans = base.map((h, i) => ({
        ...h,
        position: [i * 2, 0] as [number, number],
        activity,
        yaw: 0,
        activityTime: time,
        walking: activity === "walking",
      }));
      o.sync([-3, -2, 0], humans);
      for (const h of humans) {
        const bounds = humanBounds(h);
        o.people.get(h.id)!.traverse((obj) => {
          if (!(obj instanceof T.Mesh)) return;
          let p: T.Object3D | null = obj;
          while (p) {
            if (!p.visible) return;
            p = p.parent;
          }
          const b = new T.Box3().setFromObject(obj);
          assert(
            b.min.x >= bounds[0] - 0.01 &&
              b.max.x <= bounds[2] + 0.01 &&
              b.min.y >= bounds[1] - 0.01 &&
              b.max.y <= bounds[3] + 0.01,
            `${activity} ${obj.parent?.name}: bounds ${JSON.stringify(b)}`,
          );
        });
      }
    }
});
test("random activity scenarios retain collision-free repeated human visits", () => {
  const o = new Office(config);
  for (let seed = 0; seed < 24; seed++) {
    const s = new Simulation(config, o.obstacles, o.humans);
    s.reset(seed);
    s.approach();
    for (let i = 0; i < 18000 && s.running && s.tour.completed_visits < 4; i++)
      s.tick(1 / 30);
    assert.equal(s.blocked, null, `seed ${seed}`);
    assert(
      s.tour.completed_visits >= 4,
      `seed ${seed}: ${s.tour.status} ${s.humans.map((h) => h.activity)}`,
    );
  }
});

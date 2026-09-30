import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Simulation,
  Planner,
  OccupancyMap,
  intersects,
  type Config,
  type Obstacle,
} from "../src/core";
import { Office } from "../src/scene";
import { npy } from "../src/snapshot";
const config = () =>
  JSON.parse(
    readFileSync(new URL("../public/config.json", import.meta.url), "utf8"),
  ) as Config;
function office() {
  const c = config(),
    o = new Office(c);
  return new Simulation(c, o.obstacles, o.humans);
}
function run(s: Simulation, n = 9000) {
  for (let i = 0; i < n && s.running; i++) s.tick(1 / 30);
}
test("manual forward, strafe, rotation, command validation and speed cap", () => {
  const s = office();
  let p = [...s.pose];
  s.step(0.6, 0, 0, 1);
  assert(Math.abs(s.pose[0] - p[0] - 0.6) < 1e-8);
  p = [...s.pose];
  s.step(0, 0.6, 0, 1);
  assert(Math.abs(s.pose[1] - p[1] - 0.6) < 1e-8);
  s.step(0, 0, 1, 1);
  assert(Math.abs(s.pose[2] - 1) < 1e-8);
  assert.throws(() => s.step(NaN, 0, 0, 1));
  assert.throws(() => s.step(0, 0, 0, 2));
  s.reset();
  s.step(60, 0, 0, 1);
  assert(Math.abs(s.pose[0] + 2.2) < 1e-8);
});
test("footprint collision prevents crossing walls at any angle", () => {
  const b: Obstacle = [0, -2, 0.1, 2, "wall"];
  assert(intersects([-0.1, 0, Math.PI / 4], 0.55, 0.45, b));
  assert(!intersects([-1, 0, Math.PI / 4], 0.55, 0.45, b));
  const c = config();
  c.robot.start_pose = [-1, 0, 0];
  const s = new Simulation(c, [b], []);
  s.step(0.6, 0, 0, 1);
  s.step(0.6, 0, 0, 1);
  assert.equal(s.blocked, "wall");
  assert(s.pose[0] < -0.27);
});
test("office continuously visits person 1, person 2, person 1, person 2", () => {
  const s = office();
  assert.equal(s.approach(), "EXECUTING");
  for (let i = 0; i < 12000 && s.tour.completed_visits < 4; i++) s.tick(1 / 30);
  assert.deepEqual(s.tour.recent_visit_order, [
    "person 1",
    "person 2",
    "person 1",
    "person 2",
  ]);
  assert.equal(s.blocked, null);
  const target = s.planner.target!;
  assert(
    Math.abs(
      Math.hypot(
        s.pose[0] - target.position[0],
        s.pose[1] - target.position[1],
      ) - 1,
    ) < 0.1,
  );
});
test("dwell keeps robot stationary; pause freezes simulation", () => {
  const s = office();
  s.approach();
  while (s.tour.completed_visits < 1 && s.time < 100) s.tick(1 / 30);
  assert.equal(s.tour.status, "DWELLING");
  const p = [...s.pose];
  for (let i = 0; i < 50; i++) s.tick(1 / 30);
  assert.deepEqual(s.pose, p);
  assert(s.tour.dwell_remaining_s > 0);
  s.running = false;
  const t = s.time,
    d = s.tour.dwell_remaining_s;
  run(s, 100);
  assert.equal(s.time, t);
  assert.equal(s.tour.dwell_remaining_s, d);
});
test("reset restores people, robot, time and history; manual takeover clears tour", () => {
  const s = office();
  s.setHumanPosition("person 1", -2.2, -0.3);
  s.approach();
  run(s, 120);
  s.manual();
  assert.equal(s.tour.enabled, false);
  assert.equal(s.planner.path.length, 0);
  s.reset();
  assert.deepEqual(
    s.humans.map((h) => h.id),
    s.initialHumans.map((h) => h.id),
  );
  assert(s.humans.every((h) => h.activity && h.activityTime === 0));
  assert.notDeepEqual(s.humans[0].position, [-2.2, -0.3]);
  assert.deepEqual(s.pose, s.config.robot.start_pose);
  assert.equal(s.time, 0);
  assert.equal(s.running, false);
  assert.equal(s.tour.completed_visits, 0);
});
test("moving humans rebuilds map and replans on next tick", () => {
  const s = office();
  s.approach();
  const r = s.revision;
  s.setHumanPosition("person 1", -2.2, -0.3);
  s.tick(1 / 30);
  assert(s.revision > r);
  assert.deepEqual(s.planner.target?.position, [-2.2, -0.3]);
});
test("no-human, no-path, occupied start and newly blocked route stop", () => {
  const c = config(),
    p = new Planner(c, []);
  assert.equal(
    p.plan(c.robot.start_pose as [number, number, number], []),
    "NO_HUMAN",
  );
  const wall: Obstacle = [-0.2, -3, 0.2, 3, "wall"];
  const blocked = new Planner(c, [wall]);
  assert.equal(
    blocked.plan([-2, 0, 0], [{ id: "x", position: [2, 0] }]),
    "NO_PATH",
  );
  assert.equal(
    blocked.plan([0, 0, 0], [{ id: "x", position: [2, 0] }]),
    "COLLISION",
  );
  const s = office();
  s.approach();
  s.obstacles.push([
    s.pose[0] - 0.5,
    s.pose[1] - 0.5,
    s.pose[0] + 0.5,
    s.pose[1] + 0.5,
    "new blockage",
  ]);
  s.tick(1 / 30);
  assert.equal(s.tour.status, "COLLISION");
  assert.equal(s.running, false);
});
test("unreachable nearest human falls back to reachable person", () => {
  const c = config(),
    p = new Planner(c, [[-0.2, -3, 0.2, 3, "wall"]]);
  assert.equal(
    p.plan(
      [-1, 0, 0],
      [
        { id: "blocked", position: [1, 0] },
        { id: "reachable", position: [-2, 2] },
      ],
    ),
    "EXECUTING",
  );
  assert.equal(p.target?.id, "reachable");
});
test("single person repeats; no people after a change stops", () => {
  const c = config(),
    s = new Simulation(c, [], [{ id: "one", position: [0, 0] }]);
  s.approach();
  for (let i = 0; i < 6000 && s.tour.completed_visits < 3; i++) s.tick(1 / 30);
  assert.equal(s.tour.completed_visits, 3);
  s.humans = [];
  s.syncHumans();
  s.tick(1 / 30);
  assert.equal(s.tour.status, "NO_HUMAN");
  assert.equal(s.running, false);
});
test("A* segments cannot cut occupied corners", () => {
  const c = config(),
    map = new OccupancyMap(c, [[-0.1, -0.1, 0.1, 0.1, "box"]]);
  const path = map.search([-1, 0], [map.cell([1, 0])])!;
  assert(path.length > 0);
  for (let i = 1; i < path.length; i++)
    assert(map.segmentFree(map.point(path[i - 1]), map.point(path[i])));
  assert(!map.segmentFree([-1, 0], [1, 0]));
});
test("snapshot NPY is little-endian float32 with top-left row ordering and bool masks", () => {
  const bytes = npy(new Float32Array([1, NaN, 2, 3]), 2, 2),
    view = new DataView(bytes.buffer),
    h = view.getUint16(8, true),
    header = new TextDecoder().decode(bytes.subarray(10, 10 + h));
  assert(header.includes("'<f4'"));
  assert(header.includes("(2, 2)"));
  assert.equal(view.getFloat32(10 + h, true), 1);
  assert(Number.isNaN(view.getFloat32(14 + h, true)));
  assert.equal((10 + h) % 64, 0);
  const mask = npy(new Uint8Array([1, 0]), 2, 1);
  assert(new TextDecoder().decode(mask).includes("|b1"));
});

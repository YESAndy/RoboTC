import {
  assignActivities,
  advanceActivities,
  humanBounds,
  type Activity,
} from "./activities";
export type XY = [number, number];
export type Pose = [number, number, number];
export type Obstacle = [number, number, number, number, string];
export type Human = {
  id: string;
  position: XY;
  activity?: Activity;
  yaw?: number;
  activityTime?: number;
  walking?: boolean;
  walkRoute?: XY[];
  walkTarget?: number;
};
export type CameraSpec = {
  mount_m: number[];
  yaw_deg: number;
  pitch_deg: number;
  hfov_deg: number;
  near_m: number;
  far_m: number;
};
export type Config = {
  preset: string;
  room: { width_m: number; depth_m: number; height_m: number };
  robot: {
    length_m: number;
    width_m: number;
    height_m: number;
    start_pose: number[];
    speed_m_s: number;
    yaw_speed_rad_s: number;
  };
  depth: CameraSpec;
  thermal: CameraSpec & {
    noise_std_c: number;
    display_min_c: number;
    display_max_c: number;
  };
  presets: Record<
    string,
    { depth_size: number[]; thermal_size: number[]; sensor_hz: number }
  >;
  temperatures_c: Record<string, number>;
  planner: {
    resolution_m: number;
    occupancy_threshold: number;
    standoff_m: number;
    dwell_s: number;
  };
  seed: number;
};
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function intersects(
  p: Pose,
  length: number,
  width: number,
  b: Obstacle,
) {
  const c = Math.cos(p[2]),
    s = Math.sin(p[2]),
    dx = (b[0] + b[2]) / 2 - p[0],
    dy = (b[1] + b[3]) / 2 - p[1],
    ex = (b[2] - b[0]) / 2,
    ey = (b[3] - b[1]) / 2,
    hx = length / 2 + 0.015,
    hy = width / 2 + 0.015;
  return [
    [1, 0],
    [0, 1],
    [c, s],
    [-s, c],
  ].every(
    ([x, y]) =>
      Math.abs(dx * x + dy * y) <=
      hx * Math.abs(c * x + s * y) +
        hy * Math.abs(-s * x + c * y) +
        ex * Math.abs(x) +
        ey * Math.abs(y),
  );
}
// A binary heap keeps A* independent of browser timing and rendering.
class Heap {
  data: { id: number; g: number; f: number }[] = [];
  push(v: { id: number; g: number; f: number }) {
    let i = this.data.length;
    this.data.push(v);
    while (i) {
      const p = (i - 1) >> 1;
      if (this.data[p].f <= v.f) break;
      this.data[i] = this.data[p];
      i = p;
    }
    this.data[i] = v;
  }
  pop() {
    const first = this.data[0],
      last = this.data.pop()!;
    if (this.data.length) {
      let i = 0;
      while (i * 2 + 1 < this.data.length) {
        let j = i * 2 + 1;
        if (j + 1 < this.data.length && this.data[j + 1].f < this.data[j].f)
          j++;
        if (this.data[j].f >= last.f) break;
        this.data[i] = this.data[j];
        i = j;
      }
      this.data[i] = last;
    }
    return first;
  }
}
export class OccupancyMap {
  resolution: number;
  threshold: number;
  nx: number;
  ny: number;
  radius: number;
  inflation: number;
  cells: Uint8Array;
  constructor(
    public config: Config,
    public obstacles: Obstacle[],
  ) {
    this.resolution = config.planner.resolution_m;
    this.threshold = config.planner.occupancy_threshold;
    if (this.resolution <= 0 || this.threshold < 0 || this.threshold >= 1)
      throw Error("Invalid occupancy map configuration");
    this.nx = Math.ceil(config.room.width_m / this.resolution);
    this.ny = Math.ceil(config.room.depth_m / this.resolution);
    this.radius = Math.hypot(
      config.robot.length_m / 2 + 0.015,
      config.robot.width_m / 2 + 0.015,
    );
    this.inflation = this.radius + (this.resolution * Math.SQRT2) / 2;
    this.cells = new Uint8Array(this.nx * this.ny);
    this.rebuild();
  }
  cell(p: number[]): XY {
    return [
      Math.floor((p[0] + this.config.room.width_m / 2) / this.resolution),
      Math.floor((p[1] + this.config.room.depth_m / 2) / this.resolution),
    ];
  }
  point(c: XY): XY {
    return [
      -this.config.room.width_m / 2 + (c[0] + 0.5) * this.resolution,
      -this.config.room.depth_m / 2 + (c[1] + 0.5) * this.resolution,
    ];
  }
  id(c: XY) {
    return c[1] * this.nx + c[0];
  }
  coord(id: number): XY {
    return [id % this.nx, Math.floor(id / this.nx)];
  }
  geometry(p: number[]) {
    const [x, y] = p,
      d = this.inflation;
    return +(
      Math.abs(x) >= this.config.room.width_m / 2 - this.radius ||
      Math.abs(y) >= this.config.room.depth_m / 2 - this.radius ||
      this.obstacles.some(
        (b) => x >= b[0] - d && x <= b[2] + d && y >= b[1] - d && y <= b[3] + d,
      )
    );
  }
  rebuild() {
    for (let j = 0; j < this.ny; j++)
      for (let i = 0; i < this.nx; i++)
        this.cells[this.id([i, j])] = this.geometry(this.point([i, j]));
  }
  free(c: XY) {
    return (
      c[0] >= 0 &&
      c[1] >= 0 &&
      c[0] < this.nx &&
      c[1] < this.ny &&
      this.cells[this.id(c)] <= this.threshold
    );
  }
  occupancy(p: number[]) {
    return Math.max(this.free(this.cell(p)) ? 0 : 1, this.geometry(p));
  }
  segmentFree(a: number[], b: number[]) {
    if (
      this.occupancy(a) > this.threshold ||
      this.occupancy(b) > this.threshold
    )
      return false;
    // Exact slab intersections catch even tiny clips of occupied cell corners.
    const crosses = (
      xmin: number,
      ymin: number,
      xmax: number,
      ymax: number,
    ) => {
      let lo = 0,
        hi = 1;
      for (const [axis, min, max] of [
        [0, xmin, xmax],
        [1, ymin, ymax],
      ]) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-12) {
          if (a[axis] < min || a[axis] > max) return false;
        } else {
          const u = (min - a[axis]) / delta,
            v = (max - a[axis]) / delta;
          lo = Math.max(lo, Math.min(u, v));
          hi = Math.min(hi, Math.max(u, v));
          if (lo > hi) return false;
        }
      }
      return true;
    };
    const ca = this.cell(a),
      cb = this.cell(b),
      r = this.resolution;
    for (
      let y = Math.max(0, Math.min(ca[1], cb[1]) - 1);
      y <= Math.min(this.ny - 1, Math.max(ca[1], cb[1]) + 1);
      y++
    )
      for (
        let x = Math.max(0, Math.min(ca[0], cb[0]) - 1);
        x <= Math.min(this.nx - 1, Math.max(ca[0], cb[0]) + 1);
        x++
      ) {
        if (this.free([x, y])) continue;
        const px = -this.config.room.width_m / 2 + x * r,
          py = -this.config.room.depth_m / 2 + y * r;
        if (crosses(px, py, px + r, py + r)) return false;
      }
    const d = this.inflation;
    if (
      this.obstacles.some((o) =>
        crosses(o[0] - d, o[1] - d, o[2] + d, o[3] + d),
      )
    )
      return false;
    return true;
  }
  search(start: number[], candidates: XY[]): XY[] | null {
    const source = this.cell(start),
      goals = candidates.filter((c) => this.free(c));
    if (!this.free(source) || !goals.length) return null;
    const goalSet = new Set(goals.map((c) => this.id(c))),
      sid = this.id(source),
      heap = new Heap(),
      cost = new Float64Array(this.cells.length).fill(Infinity),
      parent = new Int32Array(this.cells.length).fill(-1);
    const heuristic = (c: XY) => Math.min(...goals.map((g) => dist(c, g)));
    cost[sid] = 0;
    heap.push({ id: sid, g: 0, f: heuristic(source) });
    while (heap.data.length) {
      const cur = heap.pop();
      if (cur.g > cost[cur.id] + 1e-9) continue;
      if (goalSet.has(cur.id)) {
        const route: XY[] = [];
        for (let id = cur.id; id !== -1; id = parent[id])
          route.push(this.coord(id));
        return route.reverse();
      }
      const [x, y] = this.coord(cur.id);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const n: XY = [x + dx, y + dy];
        if (
          !this.free(n) ||
          (dx && dy && (!this.free([x + dx, y]) || !this.free([x, y + dy])))
        )
          continue;
        const id = this.id(n),
          g = cur.g + Math.hypot(dx, dy);
        if (g < cost[id]) {
          cost[id] = g;
          parent[id] = cur.id;
          heap.push({ id, g, f: g + heuristic(n) });
        }
      }
    }
    return null;
  }
}
export class Planner {
  map: OccupancyMap;
  status = "IDLE";
  target: Human | null = null;
  goal: XY | null = null;
  path: XY[] = [];
  index = 0;
  constructor(
    public config: Config,
    obstacles: Obstacle[],
  ) {
    this.map = new OccupancyMap(config, obstacles);
  }
  reset() {
    this.status = "IDLE";
    this.target = null;
    this.goal = null;
    this.path = [];
    this.index = 0;
  }
  plan(pose: Pose, humans: Human[]) {
    this.reset();
    this.map.rebuild();
    if (this.map.occupancy(pose) > this.map.threshold)
      return (this.status = "COLLISION");
    if (!humans.length) return (this.status = "NO_HUMAN");
    for (const human of [...humans].sort(
      (a, b) =>
        dist(pose, a.position) - dist(pose, b.position) ||
        a.id.localeCompare(b.id),
    )) {
      const r = this.config.planner.standoff_m;
      const goals = Array.from({ length: 48 }, (_, i) =>
        this.map.cell([
          human.position[0] + r * Math.cos((i * Math.PI) / 24),
          human.position[1] + r * Math.sin((i * Math.PI) / 24),
        ]),
      );
      const route = this.map.search(pose, goals);
      if (!route) continue;
      const pts: XY[] = [
          [pose[0], pose[1]],
          ...route.map((c) => this.map.point(c)),
        ],
        path = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let next = i + 1;
        for (let j = pts.length - 1; j > i; j--)
          if (this.map.segmentFree(pts[i], pts[j])) {
            next = j;
            break;
          }
        if (!this.map.segmentFree(pts[i], pts[next])) break;
        path.push(pts[next]);
        i = next;
      }
      if (i !== pts.length - 1) continue;
      this.target = structuredClone(human);
      this.path = path;
      this.goal = path.at(-1)!;
      this.index = path.length > 1 ? 1 : 0;
      return (this.status = "EXECUTING");
    }
    return (this.status = "NO_PATH");
  }
  command(p: Pose, dt = 1 / 30): Pose {
    const zero: Pose = [0, 0, 0];
    if (this.status !== "EXECUTING") return zero;
    if (this.map.occupancy(p) > this.map.threshold) {
      this.status = "COLLISION";
      return zero;
    }
    while (
      this.index < this.path.length &&
      dist(p, this.path[this.index]) < 1e-5
    )
      this.index++;
    const point =
        this.index === this.path.length
          ? this.target!.position
          : this.path[this.index],
      error = angle(Math.atan2(point[1] - p[1], point[0] - p[0]) - p[2]);
    if (this.index === this.path.length) {
      if (Math.abs(error) < 0.03) {
        this.status = "SUCCESS";
        return zero;
      }
      return [0, 0, clamp(error * 2.5, -0.9, 0.9)];
    }
    if (!this.map.segmentFree(p, point)) {
      this.status = "COLLISION";
      return zero;
    }
    if (Math.abs(error) >= 0.03) return [0, 0, clamp(error * 2.5, -0.9, 0.9)];
    const speed = Math.min(this.config.robot.speed_m_s, dist(p, point) / dt);
    return [speed * Math.cos(error), speed * Math.sin(error), 0];
  }
  info() {
    return {
      status: this.status,
      detector: "global scene oracle",
      target: this.target,
      goal_xy_m: this.goal,
      path_xy_m: this.path,
      waypoint_index: this.index,
      occupancy_threshold: this.map.threshold,
      grid_resolution_m: this.map.resolution,
    };
  }
}
export class Simulation {
  pose: Pose;
  time = 0;
  running = false;
  blocked: string | null = null;
  planner: Planner;
  humans: Human[];
  initialHumans: Human[];
  staticObstacles: Obstacle[];
  obstacles: Obstacle[];
  tour = {
    enabled: false,
    status: "IDLE",
    completed_visits: 0,
    completed_rounds: 0,
    visited_this_round: [] as string[],
    last_person: null as string | null,
    recent_visit_order: [] as string[],
    dwell_remaining_s: 0,
  };
  revision = 0;
  signature = "";
  activitySeed: number | null = null;
  constructor(
    public config: Config,
    obstacles: Obstacle[],
    humans: Human[],
  ) {
    this.staticObstacles = structuredClone(obstacles);
    this.humans = structuredClone(humans);
    this.initialHumans = structuredClone(humans);
    this.obstacles = [];
    this.syncHumans();
    this.pose = [...config.robot.start_pose] as Pose;
    this.planner = new Planner(config, this.obstacles);
  }
  syncHumans() {
    this.obstacles.splice(
      0,
      this.obstacles.length,
      ...this.staticObstacles,
      ...this.humans.map(humanBounds),
    );
  }
  clearTour() {
    Object.assign(this.tour, {
      enabled: false,
      status: "IDLE",
      completed_visits: 0,
      completed_rounds: 0,
      visited_this_round: [],
      last_person: null,
      recent_visit_order: [],
      dwell_remaining_s: 0,
    });
    this.planner.reset();
    this.revision++;
  }
  reset(seed = Math.floor(Math.random() * 0x100000000)) {
    this.activitySeed = seed >>> 0;
    this.pose = [...this.config.robot.start_pose] as Pose;
    this.humans = assignActivities(this.initialHumans, this.activitySeed);
    this.syncHumans();
    this.time = 0;
    this.running = false;
    this.blocked = null;
    this.clearTour();
  }
  manual() {
    this.clearTour();
    this.blocked = null;
    this.running = true;
  }
  setHumanPosition(id: string, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw Error("Human coordinates must be finite");
    const h = this.humans.find((h) => h.id === id);
    if (!h) throw Error("Unknown human: " + id);
    h.position = [x, y];
    // Explicit placement becomes a stationary override until the next reset.
    h.activity = "standing";
    h.walkRoute = undefined;
    h.walking = false;
    h.yaw = 0;
    this.syncHumans();
  }
  humanSignature() {
    return JSON.stringify(
      this.humans
        .map((h) => [
          h.id,
          ...h.position.map((v) =>
            h.activity === "walking" ? Math.round(v / 0.1) : v,
          ),
        ])
        .sort(),
    );
  }
  next() {
    this.signature = this.humanSignature();
    this.tour.visited_this_round = this.tour.visited_this_round.filter((id) =>
      this.humans.some((h) => h.id === id),
    );
    let people = this.humans.filter(
      (h) => !this.tour.visited_this_round.includes(h.id),
    );
    if (this.humans.length && !people.length) {
      this.tour.completed_rounds++;
      this.tour.visited_this_round = [];
      people =
        this.humans.length > 1
          ? this.humans.filter((h) => h.id !== this.tour.last_person)
          : this.humans;
    }
    this.tour.status = this.planner.plan(this.pose, people);
    this.revision++;
    if (!this.active()) this.running = false;
  }
  active() {
    return this.tour.status === "EXECUTING" || this.tour.status === "DWELLING";
  }
  approach() {
    this.clearTour();
    this.blocked = null;
    this.tour.enabled = true;
    this.next();
    this.running = this.active();
    return this.tour.status;
  }
  command(dt = 1 / 30): Pose {
    const zero: Pose = [0, 0, 0];
    if (!this.active()) return zero;
    if (this.signature !== this.humanSignature()) {
      if (
        this.tour.status === "DWELLING" &&
        this.humans.some(
          (h) =>
            h.id === this.planner.target?.id &&
            Math.hypot(
              h.position[0] - this.planner.target.position[0],
              h.position[1] - this.planner.target.position[1],
            ) < 0.25,
        )
      ) {
        this.signature = this.humanSignature();
        this.planner.map.rebuild();
      } else {
        this.next();
      }
    }
    if (this.tour.status === "DWELLING") {
      if (this.planner.map.occupancy(this.pose) > this.planner.map.threshold) {
        this.stopCollision("occupied map cell");
        return zero;
      }
      this.tour.dwell_remaining_s = Math.max(
        0,
        this.tour.dwell_remaining_s - dt,
      );
      if (this.tour.dwell_remaining_s <= 1e-9) this.next();
      return zero;
    }
    if (this.tour.status !== "EXECUTING") return zero;
    let c = this.planner.command(this.pose, dt);
    // A moving person can invalidate a previously clear endpoint before the
    // next quantized oracle update. Replan while the current pose is safe.
    if (
      this.planner.status === "COLLISION" &&
      this.humans.some((h) => h.activity === "walking") &&
      this.planner.map.geometry(this.pose) <= this.planner.map.threshold
    ) {
      this.next();
      c = this.planner.command(this.pose, dt);
    }
    if (this.planner.status === "SUCCESS") {
      const id = this.planner.target!.id;
      this.tour.visited_this_round.push(id);
      this.tour.last_person = id;
      this.tour.completed_visits++;
      this.tour.recent_visit_order.push(id);
      this.tour.recent_visit_order = this.tour.recent_visit_order.slice(-100);
      this.tour.status = "DWELLING";
      this.tour.dwell_remaining_s = this.config.planner.dwell_s;
    } else if (this.planner.status !== "EXECUTING") {
      this.tour.status = this.planner.status;
      this.running = false;
    }
    return c;
  }
  stopCollision(reason: string) {
    this.blocked = reason;
    if (this.tour.enabled) {
      this.planner.status = "COLLISION";
      this.tour.status = "COLLISION";
    }
    this.running = false;
  }
  step(vx: number, vy: number, yawRate: number, dt: number) {
    if (![vx, vy, yawRate, dt].every(Number.isFinite) || dt < 0 || dt > 1)
      throw Error("Finite commands and dt between 0 and 1 required");
    const r = this.config.robot,
      norm = Math.hypot(vx, vy);
    if (norm > r.speed_m_s) {
      vx *= r.speed_m_s / norm;
      vy *= r.speed_m_s / norm;
    }
    yawRate = clamp(yawRate, -r.yaw_speed_rad_s, r.yaw_speed_rad_s);
    const n = Math.max(
        1,
        Math.ceil(
          Math.max(
            (Math.hypot(vx, vy) * dt) / 0.02,
            (Math.abs(yawRate) * dt) / 0.04,
          ),
        ),
      ),
      h = dt / n;
    this.blocked = null;
    for (let i = 0; i < n; i++) {
      const [x, y, a] = this.pose,
        mid = a + (yawRate * h) / 2,
        p: Pose = [
          x + (vx * Math.cos(mid) - vy * Math.sin(mid)) * h,
          y + (vx * Math.sin(mid) + vy * Math.cos(mid)) * h,
          angle(a + yawRate * h),
        ],
        hit = this.obstacles.find((b) =>
          intersects(p, r.length_m, r.width_m, b),
        );
      if (
        hit ||
        (this.tour.enabled &&
          this.planner.map.occupancy(p) > this.planner.map.threshold)
      ) {
        this.stopCollision(hit?.[4] ?? "occupied map cell");
        break;
      }
      this.pose = p;
    }
    advanceActivities(this.humans, this.staticObstacles, this.pose, dt);
    this.syncHumans();
    this.time += dt;
    return this.blocked === null;
  }
  tick(dt: number, manual: Pose = [0, 0, 0]) {
    if (this.running) {
      const c = this.tour.enabled ? this.command(dt) : manual;
      if (this.running) this.step(...c, dt);
    }
  }
}

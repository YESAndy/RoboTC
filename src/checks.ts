import * as T from "three";
import { Sensors, cameraFor, calibration } from "./sensors";
import type { Config, Pose } from "./core";
import { Office } from "./scene";
import { Simulation } from "./core";
export function sensorChecks(renderer: T.WebGLRenderer, original: Config) {
  const config = structuredClone(original);
  config.depth = {
    mount_m: [0, 0, 0],
    yaw_deg: 0,
    pitch_deg: 0,
    hfov_deg: 70,
    near_m: 0.2,
    far_m: 10,
  };
  config.thermal = { ...config.thermal, ...config.depth };
  config.presets.standard = {
    depth_size: [32, 24],
    thermal_size: [32, 24],
    sensor_hz: 5,
  };
  config.preset = "standard";
  const scene = new T.Scene(),
    sensor = new Sensors(renderer, scene, config),
    geometry = new T.BoxGeometry(0.1, 4, 4),
    material = new T.MeshBasicMaterial(),
    front = new T.Mesh(geometry, material),
    back = new T.Mesh(geometry, material);
  front.position.x = 2.55;
  back.position.x = 4.55;
  front.userData.temperature = 42;
  back.userData.temperature = 80;
  front.layers.set(1);
  back.layers.set(1);
  scene.add(front, back);
  const results: { name: string; passed: boolean; actual?: unknown }[] = [];
  const check = (name: string, passed: boolean, actual?: unknown) => {
    results.push({ name, passed, actual });
  };
  const center = 12 * 32 + 16,
    pose: Pose = [0, 0, 0];
  try {
    let o = sensor.observe(pose);
    check(
      "forward-axis depth at 2.5 m",
      Math.abs(o.depth.frame.values[center] - 2.5) < 1e-4,
      o.depth.frame.values[center],
    );
    check(
      "visible surface temperature 42 C",
      Math.abs(o.thermal.frame.values[center] - 42) < 1e-4,
      o.thermal.frame.values[center],
    );
    check(
      "occluded 80 C surface remains hidden",
      !Array.from(o.thermal.frame.values).some((v) => v > 79),
    );
    front.visible = false;
    o = sensor.observe(pose);
    check(
      "revealed surface depth 4.5 m",
      Math.abs(o.depth.frame.values[center] - 4.5) < 1e-4,
      o.depth.frame.values[center],
    );
    check(
      "revealed surface temperature 80 C",
      Math.abs(o.thermal.frame.values[center] - 80) < 1e-4,
    );
    back.visible = false;
    o = sensor.observe(pose);
    check(
      "empty pixels are NaN with invalid mask",
      o.depth.frame.values.every(Number.isNaN) &&
        o.depth.frame.valid.every((v) => v === 0),
    );
    front.visible = true;
    front.position.set(0, 2.55, 0);
    front.rotation.z = Math.PI / 2;
    o = sensor.observe([0, 0, Math.PI / 2]);
    check(
      "rotated camera +Y depth",
      Math.abs(o.depth.frame.values[center] - 2.5) < 1e-4,
    );
    front.position.set(11, 0, 0);
    front.rotation.z = 0;
    o = sensor.observe(pose);
    check(
      "far clip excludes distant geometry",
      o.depth.frame.valid.every((v) => v === 0),
    );
    front.position.set(2.55, -0.6, 0.6);
    front.scale.set(1, 0.15, 0.15);
    o = sensor.observe(pose);
    let sx = 0,
      sy = 0,
      n = 0;
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 32; x++)
        if (o.depth.frame.valid[y * 32 + x]) {
          sx += x;
          sy += y;
          n++;
        }
    check(
      "pixel origin top left, right is -Y",
      n > 0 && sx / n > 15.5 && sy / n < 11.5,
      { centroid: [sx / n, sy / n] },
    );
    const cal = calibration(
      cameraFor(pose, config.depth, [32, 24]),
      config.depth,
      [32, 24],
    );
    check(
      "70 degree horizontal FOV calibration",
      Math.abs(cal.K[0][0] - 32 / (2 * Math.tan((35 * Math.PI) / 180))) < 1e-8,
    );
    check(
      "camera axes right down forward",
      cal.T_world_camera[0][2] > 0.999 &&
        cal.T_world_camera[1][0] < -0.999 &&
        cal.T_world_camera[2][1] < -0.999,
    );
  } finally {
    sensor.dispose();
    geometry.dispose();
    material.dispose();
  }
  return results;
}
export function sceneChecks(config: Config) {
  const o = new Office(config),
    s = new Simulation(config, o.obstacles, o.humans);
  s.approach();
  for (let i = 0; i < 15000 && s.tour.completed_visits < 4; i++) s.tick(1 / 30);
  const visit = {
    name: "four consecutive office visits",
    passed:
      JSON.stringify(s.tour.recent_visit_order) ===
      JSON.stringify(["person 1", "person 2", "person 1", "person 2"]),
    actual: s.tour.recent_visit_order,
  };
  s.setHumanPosition("person 1", -2.2, -0.3);
  o.sync(s.pose, s.humans);
  const part = o.people.get("person 1")!.children[0];
  part.position.z += 0.3;
  s.reset();
  o.resetPeople();
  o.sync(s.pose, s.humans);
  const reset = {
    name: "reset restores human roots, body parts and history",
    passed:
      o.people.get("person 1")!.position.x === -0.05 &&
      Math.abs(part.position.z - 0.055) < 1e-8 &&
      s.tour.completed_visits === 0,
  };
  o.meshes.forEach((m) => m.geometry.dispose());
  o.materials.forEach((m) => m.dispose());
  o.route.geometry.dispose();
  return [visit, reset];
}

export function officeRayChecks(renderer: T.WebGLRenderer, config: Config) {
  const office = new Office(config),
    sensors = new Sensors(renderer, office.scene, config),
    pose: Pose = [-2.8, -1.6, 0];
  office.sync(pose, office.humans);
  const checks = [];
  try {
    for (const kind of ["depth", "thermal"] as const) {
      const spec = config[kind],
        size =
          config.presets[config.preset][
            kind === "depth" ? "depth_size" : "thermal_size"
          ],
        camera = cameraFor(pose, spec, size),
        result = sensors.pass(kind, pose),
        f = size[0] / (2 * Math.tan((spec.hfov_deg * Math.PI) / 360)),
        ray = new T.Raycaster();
      ray.layers.set(1);
      let maximum = 0,
        matched = 0,
        validMismatch = 0;
      for (let iy = 0; iy < 10; iy++)
        for (let ix = 0; ix < 15; ix++) {
          const x = Math.floor(((ix + 0.37) * size[0]) / 15),
            y = Math.floor(((iy + 0.37) * size[1]) / 10),
            v = new T.Vector3(
              (x - (size[0] - 1) / 2) / f,
              -(y - (size[1] - 1) / 2) / f,
              -1,
            ).normalize(),
            cos = -v.z;
          ray.near = spec.near_m / cos;
          ray.far = spec.far_m / cos;
          ray.set(camera.position, v.applyQuaternion(camera.quaternion));
          const hit = ray.intersectObjects(office.meshes, false)[0],
            index = y * size[0] + x;
          if (Boolean(hit) !== Boolean(result.frame.valid[index])) {
            validMismatch++;
            continue;
          }
          if (hit) {
            const expected =
              kind === "depth"
                ? hit.point.clone().applyMatrix4(camera.matrixWorldInverse).z *
                  -1
                : hit.object.userData.temperature;
            maximum = Math.max(
              maximum,
              Math.abs(expected - result.frame.values[index]),
            );
            matched++;
          }
        }
      checks.push({
        name: kind + " agrees with independent office raycasts",
        passed: maximum < 0.002 && validMismatch === 0 && matched > 50,
        actual: {
          maximum_error: maximum,
          matched,
          valid_mismatches: validMismatch,
        },
      });
    }
  } finally {
    sensors.dispose();
    office.meshes.forEach((m) => m.geometry.dispose());
    office.materials.forEach((m) => m.dispose());
    office.route.geometry.dispose();
  }
  return checks;
}

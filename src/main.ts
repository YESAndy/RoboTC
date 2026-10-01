import { ACTIVITY_LABELS } from "./activities";
import { registerTools } from "./webmcp";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Simulation, type Config, type Pose } from "./core";
import { Office } from "./scene";
import { Sensors } from "./sensors";
import { drawFrame, snapshotZip } from "./snapshot";
import "./style.css";
import { sensorChecks, sceneChecks, officeRayChecks } from "./checks";
const $ = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E;
$("app").innerHTML =
  `<header><a class="brand" href="./"><span class="brand-icon">R</span>RoboTC<span class="version">OFFICE SIMULATOR</span></a><div class="session"><span class="dot"></span> LOCAL SIMULATION <span class="divider">/</span> <span id="clock">00:00.0</span></div></header>
<main><div class="heading"><div><div class="eyebrow">HUMAN-AWARE NAVIGATION</div><h1>active thermal comfort data collection demo</h1></div><div class="preset"><label for="preset">POWER MODE</label><select id="preset"><option value="standard">Standard · 5 Hz</option><option value="low_power">Low power · 2 Hz</option></select></div></div>
<div class="workspace"><section class="overview panel"><div class="panel-heading"><h2><span class="marker"></span>Office overview</h2><span>8 × 6 m</span></div><div id="viewport" tabindex="0" aria-label="Robot driving area. W S forward back, A D sideways, Q E rotate, Space stop."><div id="loading">Preparing the office…</div><div id="comfort-bubble" class="comfort-bubble" role="status" aria-live="polite" hidden><span class="comfort-speaker">RoboTC</span><p>How do you feel about the temperature?</p></div><div class="view-label">LIVE ENVIRONMENT <span>Drag to orbit · Scroll to zoom</span></div><div class="pose" id="pose">x −2.80 · y −1.60 · yaw 0°</div></div><div class="toolbar"><div><button id="start">▶ Start</button><button id="pause">Ⅱ Pause</button><button id="reset">↺ Reset</button></div><button id="approach" class="primary">Approach people <span>↗</span></button></div></section>
<aside class="sensors"><section class="panel sensor"><div class="panel-heading"><h2><span class="marker depth"></span>Depth</h2><span id="depth-size">320 × 240</span></div><div class="sensor-image"><canvas id="depth" aria-label="Depth observation"></canvas><span class="sensor-badge">METERS</span></div><div class="scale depth-scale"></div><div class="scale-label"><span>0.2 m</span><span>10 m</span></div></section><section class="panel sensor"><div class="panel-heading"><h2><span class="marker thermal"></span>Thermal</h2><span id="thermal-size">160 × 120</span></div><div class="sensor-image"><canvas id="thermal" aria-label="Thermal observation"></canvas><span class="sensor-badge">CELSIUS</span></div><div class="scale thermal-scale"></div><div class="scale-label"><span>18°C</span><span>60°C</span></div></section></aside></div>
<div class="bottom"><section class="mission panel"><div><span class="eyebrow">CURRENT TASK</span><h3 id="status" role="status">Ready to explore</h3><p id="detail">Drive the cart, or let it approach each person in turn.</p></div><div class="metrics"><div><span>TARGET</span><strong id="target">—</strong></div><div><span>VISITS</span><strong id="visits">0</strong></div><div><span>SENSOR RATE</span><strong id="rate">—</strong></div></div><button id="snapshot" class="snapshot">↓ Save snapshot</button></section><section class="keys"><span class="eyebrow">MANUAL CONTROLS</span><div><kbd>W</kbd><kbd>S</kbd> Drive <kbd>A</kbd><kbd>D</kbd> Strafe <kbd>Q</kbd><kbd>E</kbd> Turn <kbd>Space</kbd> Stop</div><p>Click the office to drive. Leaving the driving area pauses motion.</p></section></div><div id="activities" class="activity-list" aria-label="Human activities"></div><footer><span><i></i> Oracle human detection · Ideal depth · Assigned surface temperatures</span><span>Runs on your device. Snapshots download only when requested.</span></footer><div id="error" role="alert" hidden></div></main>`;
async function boot() {
  const params = new URLSearchParams(location.search),
    benchmarkSeconds = Number(params.get("benchmark") || 0),
    testing = params.has("test") || benchmarkSeconds > 0;
  const response = await fetch(new URL("config.json", document.baseURI));
  if (!response.ok) throw Error("Unable to load simulator configuration");
  const config: Config = await response.json();
  if (config.thermal.noise_std_c !== 0)
    throw Error("This web version requires thermal noise_std_c = 0.");
  const office = new Office(config),
    sim = new Simulation(config, office.obstacles, office.humans),
    viewport = $("viewport"),
    renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: "low-power",
    });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  viewport.prepend(renderer.domElement);
  const sensor = new Sensors(renderer, office.scene, config);
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
  camera.up.set(0, 0, 1);
  camera.position.set(-7, -9, 8);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0, 0.55);
  orbit.enableDamping = false;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.minDistance = 6;
  orbit.maxDistance = 22;
  orbit.update();
  const resize = new ResizeObserver(() => {
    const w = viewport.clientWidth,
      h = viewport.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resize.observe(viewport);
  const keys = new Set<string>();
  let accumulator = 0,
    previous = performance.now(),
    nextCapture = 0,
    revision = -1,
    latest: ReturnType<typeof observe> | null = null,
    uiNext = 0,
    captureTimes: number[] = [],
    captureMs: number[] = [],
    frameCount = 0,
    snapshotBusy = false;
  function metadata(cal: unknown) {
    return {
      schema_version: 1,
      simulation: "RoboTC web",
      timestamp_s: sim.time,
      captured_at_utc: new Date().toISOString(),
      robot_pose: { x_m: sim.pose[0], y_m: sim.pose[1], yaw_rad: sim.pose[2] },
      units: { depth: "meters (camera-forward Z)", thermal: "degrees Celsius" },
      calibration: cal,
      oracle_humans: structuredClone(sim.humans),
      activity_seed: sim.activitySeed,
      task: structuredClone(sim.planner.info()),
      tour: structuredClone(sim.tour),
      configuration: structuredClone(config),
    };
  }
  function observe() {
    office.sync(sim.pose, sim.humans);
    const start = performance.now(),
      result = sensor.observe([...sim.pose]);
    captureMs.push(performance.now() - start);
    if (captureMs.length > 600) captureMs.shift();
    const now = performance.now();
    captureTimes.push(now);
    captureTimes = captureTimes.filter((t) => t >= now - 10000);
    frameCount++;
    const out = {
      depth: result.depth.frame,
      thermal: result.thermal.frame,
      metadata: metadata({
        depth: result.depth.calibration,
        thermal: result.thermal.calibration,
      }),
    };
    latest = out;
    drawFrame($<HTMLCanvasElement>("depth"), out.depth);
    drawFrame($<HTMLCanvasElement>("thermal"), out.thermal);
    return out;
  }
  function pause() {
    sim.running = false;
    keys.clear();
    accumulator = 0;
    updateUI();
  }
  function reset(seed?: number) {
    pause();
    sim.reset(seed);
    office.resetPeople();
    office.sync(sim.pose, sim.humans);
    office.setRoute([]);
    captureTimes = [];
    captureMs = [];
    frameCount = 0;
    nextCapture = 0;
    observe();
    updateUI();
  }
  function focus() {
    viewport.focus({ preventScroll: true });
  }
  const comfortBubble = $("comfort-bubble");
  const bubbleAnchor = new T.Vector3();
  function updateComfortBubble() {
    const visible = sim.tour.enabled && sim.tour.status === "DWELLING";
    comfortBubble.hidden = !visible;
    if (!visible) return;
    // Project the robot's mast into the overview; this DOM overlay never enters sensors.
    camera.updateMatrixWorld();
    bubbleAnchor.set(sim.pose[0], sim.pose[1], config.robot.height_m + 0.15).project(camera);
    if (bubbleAnchor.z < -1 || bubbleAnchor.z > 1) {
      comfortBubble.hidden = true;
      return;
    }
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const half = comfortBubble.offsetWidth / 2 + 12;
    const x = Math.max(half, Math.min(width - half, (bubbleAnchor.x + 1) * width / 2));
    const y = Math.max(comfortBubble.offsetHeight + 24, Math.min(height - 36, (1 - bubbleAnchor.y) * height / 2));
    comfortBubble.style.left = `${x}px`;
    comfortBubble.style.top = `${y}px`;
  }
  function updateUI() {
    updateComfortBubble();
    const state = sim.tour.status,
      paused = !sim.running;
    let status = paused
      ? "Paused"
      : sim.tour.enabled
        ? state === "DWELLING"
          ? "Spending a moment"
          : "Approaching a person"
        : "Manual driving";
    let detail = sim.tour.enabled
      ? state === "DWELLING"
        ? `Next visit in ${sim.tour.dwell_remaining_s.toFixed(1)} s · Round ${sim.tour.completed_rounds + 1}`
        : `Following a clear path · Round ${sim.tour.completed_rounds + 1}`
      : "W/S to drive · A/D to strafe · Q/E to turn";
    if (sim.time === 0 && !sim.running) {
      status = "Ready to explore";
      detail = "Drive the cart, or let it approach each person in turn.";
    }
    if (["COLLISION", "NO_PATH", "NO_HUMAN"].includes(state)) {
      status = {
        COLLISION: "Route blocked",
        NO_PATH: "No reachable person",
        NO_HUMAN: "No people detected",
      }[state]!;
      detail = "The robot has stopped. Reset or start a new approach.";
    } else if (sim.blocked) {
      status = "Movement blocked";
      detail = `Stopped near ${sim.blocked}. Choose another direction.`;
    }
    $("activities").textContent =
      sim.humans
        .map(
          (h) =>
            `${h.id.replace("person", "Person")}: ${ACTIVITY_LABELS[h.activity ?? "standing"]}`,
        )
        .join("  ·  ") + " — Reset to assign new activities";
    $("status").textContent = status;
    $("detail").textContent = detail;
    $("target").textContent =
      sim.planner.target?.id.replace("person", "Person") ?? "—";
    $("visits").textContent = String(sim.tour.completed_visits);
    const span = (captureTimes.at(-1)! - captureTimes[0]) / 1000;
    $("rate").textContent =
      captureTimes.length > 1 && span >= 1
        ? ((captureTimes.length - 1) / span).toFixed(1) + " Hz"
        : "—";
    $("clock").textContent =
      `${String(Math.floor(sim.time / 60)).padStart(2, "0")}:${(sim.time % 60).toFixed(1).padStart(4, "0")}`;
    $("pose").textContent =
      `x ${sim.pose[0].toFixed(2)} · y ${sim.pose[1].toFixed(2)} · yaw ${((sim.pose[2] * 180) / Math.PI).toFixed(0)}°`;
    $("approach").classList.toggle("active", sim.running && sim.tour.enabled);
    const p = config.presets[config.preset];
    $("depth-size").textContent = p.depth_size.join(" × ");
    $("thermal-size").textContent = p.thermal_size.join(" × ");
  }
  $("start").onclick = () => {
    sim.manual();
    keys.clear();
    focus();
    updateUI();
  };
  $("pause").onclick = pause;
  $("reset").onclick = () => reset();
  $("approach").onclick = () => {
    keys.clear();
    sim.approach();
    focus();
    updateUI();
  };
  $<HTMLSelectElement>("preset").value = config.preset;
  $("preset").onchange = () => {
    config.preset = $<HTMLSelectElement>("preset").value;
    captureTimes = [];
    nextCapture = 0;
    observe();
    updateUI();
  };
  async function saveSnapshot() {
    if (snapshotBusy) return;
    snapshotBusy = true;
    $<HTMLButtonElement>("snapshot").disabled = true;
    try {
      const observation = observe();
      const frozen = structuredClone(observation);
      const bytes = await snapshotZip(
        frozen.depth,
        frozen.thermal,
        frozen.metadata,
      );
      const blob = new Blob([bytes as BlobPart], { type: "application/zip" }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `RoboTC-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      showError(e);
    } finally {
      snapshotBusy = false;
      $<HTMLButtonElement>("snapshot").disabled = false;
    }
  }
  $("snapshot").onclick = saveSnapshot;
  viewport.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === " ") {
      e.preventDefault();
      pause();
      return;
    }
    if (!"wasdqe".includes(key) || key.length !== 1) return;
    e.preventDefault();
    if (sim.tour.enabled || !sim.running) sim.manual();
    keys.add(key);
  });
  viewport.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  viewport.addEventListener("blur", pause);
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    previous = performance.now();
  });
  renderer.domElement.addEventListener("pointerdown", focus);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    pause();
    showError(
      Error("Graphics context was lost. Reload the page to restart RoboTC."),
    );
  });
  function animate(now: number) {
    const elapsed = Math.min(0.1, (now - previous) / 1000);
    previous = now;
    if (!document.hidden) {
      if (sim.running) {
        accumulator += elapsed;
        while (accumulator >= 1 / 30) {
          const r = config.robot,
            c: Pose = [
              (+keys.has("w") - +keys.has("s")) * r.speed_m_s,
              (+keys.has("a") - +keys.has("d")) * r.speed_m_s,
              (+keys.has("q") - +keys.has("e")) * r.yaw_speed_rad_s,
            ];
          sim.tick(1 / 30, c);
          accumulator -= 1 / 30;
        }
      } else accumulator = 0;
      office.sync(sim.pose, sim.humans);
      if (revision !== sim.revision) {
        revision = sim.revision;
        office.setRoute(sim.planner.path);
      }
      if (now >= nextCapture) {
        observe();
        const period = 1000 / config.presets[config.preset].sensor_hz;
        nextCapture = nextCapture
          ? nextCapture +
            (Math.floor((now - nextCapture) / period) + 1) * period
          : now + period;
      }
      updateComfortBubble();
      renderer.render(office.scene, camera);
      if (now > uiNext) {
        updateUI();
        uiNext = now + 100;
      }
    }
    requestAnimationFrame(animate);
  }
  // Developer API uses the same state and rendering paths as the interface.
  const api = {
    reset,
    step: (vx: number, vy: number, yaw: number, dt: number) => {
      const ok = sim.step(vx, vy, yaw, dt);
      office.sync(sim.pose, sim.humans);
      updateUI();
      return ok;
    },
    observe: () => structuredClone(observe()),
    approach: () => {
      const status = sim.approach();
      updateUI();
      return status;
    },
    pause,
    setHumanPosition: (id: string, x: number, y: number) => {
      sim.setHumanPosition(id, x, y);
      office.sync(sim.pose, sim.humans);
    },
    get state() {
      return {
        pose: [...sim.pose],
        time: sim.time,
        running: sim.running,
        humans: structuredClone(sim.humans),
        tour: structuredClone(sim.tour),
        task: structuredClone(sim.planner.info()),
        blocked: sim.blocked,
      };
    },
    get metrics() {
      return {
        frames: frameCount,
        capture_ms_mean:
          captureMs.reduce((a, b) => a + b, 0) / Math.max(1, captureMs.length),
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        triangles: renderer.info.render.triangles,
      };
    },
    snapshot: saveSnapshot,
  };
  (window as unknown as { robotc: typeof api }).robotc = api;
  registerTools(api).catch((error) =>
    console.warn("Optional browser tools unavailable", error),
  );
  if (testing) {
    const report = {
      browser: navigator.userAgent,
      checks: [
        ...sensorChecks(renderer, config),
        ...sceneChecks(config),
        ...officeRayChecks(renderer, config),
      ],
      benchmarks: [] as unknown[],
    };
    const panel = document.createElement("section");
    panel.id = "validation";
    panel.className = "panel";
    panel.style.cssText = "margin-top:20px;padding:20px;font-size:12px";
    document.querySelector("main")!.append(panel);
    const renderReport = (progress = "") => {
      panel.textContent =
        "Validation " +
        (report.checks.every((c) => c.passed) ? "PASS" : "FAIL") +
        " " +
        progress +
        "\n" +
        JSON.stringify(report, null, 2);
      panel.style.whiteSpace = "pre-wrap";
    };
    renderReport();
    if (benchmarkSeconds > 0) {
      let phase = 0,
        start = 0,
        startFrames = 0,
        baseHeap = 0,
        samples: unknown[] = [];
      const durations = [Math.min(benchmarkSeconds, 3600), 60],
        presets = ["standard", "low_power"];
      const heap = () =>
        (performance as unknown as { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? null;
      function begin() {
        config.preset = presets[phase];
        $<HTMLSelectElement>("preset").value = config.preset;
        reset();
        sim.approach();
        focus();
        start = performance.now();
        startFrames = frameCount;
        baseHeap = heap() ?? 0;
        samples = [];
      }
      begin();
      const monitor = setInterval(() => {
        const elapsed = (performance.now() - start) / 1000;
        samples.push({
          elapsed_s: elapsed,
          heap_bytes: heap(),
          visits: sim.tour.completed_visits,
          frames: frameCount - startFrames,
        });
        renderReport(
          presets[phase] +
            " " +
            elapsed.toFixed(0) +
            " / " +
            durations[phase] +
            " s",
        );
        if (elapsed >= durations[phase]) {
          report.benchmarks.push({
            preset: presets[phase],
            wall_seconds: elapsed,
            simulation_seconds: sim.time,
            frames: frameCount - startFrames,
            sensor_hz: (frameCount - startFrames) / elapsed,
            visits: sim.tour.completed_visits,
            visit_order: sim.tour.recent_visit_order,
            blocked: sim.blocked,
            status: sim.tour.status,
            heap_start_bytes: baseHeap || null,
            heap_end_bytes: heap(),
            render_resources: api.metrics,
            samples,
          });
          phase++;
          if (phase < durations.length) begin();
          else {
            clearInterval(monitor);
            pause();
            renderReport("COMPLETE");
            const a = document.createElement("a");
            a.textContent = "Download validation report";
            a.download = "validation-browser.json";
            a.href = URL.createObjectURL(
              new Blob([JSON.stringify(report, null, 2)], {
                type: "application/json",
              }),
            );
            panel.append(a);
          }
        }
      }, 1000);
    }
  }
  if (!testing) {
    sim.reset();
    office.resetPeople();
  }
  $("loading").remove();
  office.sync(sim.pose, sim.humans);
  observe();
  updateUI();
  requestAnimationFrame(animate);
}
function showError(error: unknown) {
  const box = $("error");
  box.hidden = false;
  box.textContent = error instanceof Error ? error.message : String(error);
  console.error(error);
}
boot().catch(showError);

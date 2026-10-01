# RoboTC

A lightweight office robot simulator that runs entirely in your browser. The IKEA-inspired cart provides **depth and synthetic thermal observations**, with manual driving and continuous human-aware navigation. There is no RGB observation.

## Run

Open the GitHub Pages site after deployment, or run locally with Node.js 22 or newer:

```sh
npm ci
npm run dev
```

On a Mac, you can also double-click **Launch RoboTC Web.command** to open the included production build locally.

Open the local address printed by Vite. No Blender, server backend, account, camera, microphone, or screen-recording access is required. A current desktop browser with WebGL2 and `EXT_color_buffer_float` is required. Chrome and Safari are the target browsers. The layout also adapts to narrower screens; manual driving requires a keyboard.

## Controls

- **Start:** start manual driving. Click the office to focus the driving area.
- **W/S:** forward/back. **A/D:** strafe. **Q/E:** turn. **Space:** stop.
- **Pause:** stop. Leaving the driving area, switching windows, or hiding the tab also pauses and releases all keys.
- **Approach people:** visit the nearest reachable unvisited person, stop approximately one meter away, face them, dwell two seconds, then visit the next person. Repeat after everyone has been visited. On arrival, a speech bubble asks “How do you feel about the temperature?” during the two-second visit; it disappears when the next approach begins.
- **Reset:** restore the robot, randomly assign each person an activity and its starting position, clear time, path, and visit history, and pause.
- **Save snapshot:** download a ZIP of synchronized observations and metadata.
- Drag the office to orbit; scroll to zoom. The colored overview is a visualization, not an RGB sensor.

Starting manual driving clears the current approach task. Clicking Approach starts a fresh tour. A blocked route or unreachable remaining people stops the robot, with a visible reason. Each reset independently assigns seating, standing, reading, typing, reclining, or walking; repeats are allowed. Seated activities use the two office chairs. Reading includes a book, typing includes a warm laptop and hand animation, and reclining tilts the chair back. Walkers follow short clear lanes at 0.22 m/s and yield within 1.5 m of the robot. Pause freezes activity animation and walking. There are no wheel dynamics or rigid-body physics.

## Configuration and sensors

Edit `public/config.json` and reload/rebuild. Dimensions, sensor mounts, horizontal field of view, clipping distances, planner settings, temperature assignments, and performance presets match the Blender edition. Positions are meters, robot yaw is radians, camera angles are degrees. World axes are X east, Y north, Z up; robot +X is forward and +Y is left.

| Preset | Depth | Thermal | Sensor target |
|---|---|---|---|
| Standard | 320 × 240 | 160 × 120 | 5 Hz |
| Low power | 160 × 120 | 80 × 60 | 2 Hz |

Motion uses fixed 30 Hz steps. GPU geometry passes produce forward-axis depth in meters and assigned visible surface temperature in Celsius. Both use one robot pose and simulation timestamp, with separate configured mounts. Numeric arrays are float32; invalid pixels are NaN and have a false validity mask. Pixels start at the top-left. Fixed thermal display range: 18–60°C. Windows are opaque sensor surfaces. Walls hidden in the overview still occlude sensors.

Thermal values do not model heat transfer, reflections, or calibrated radiometry. Ideal depth has no stereo artifacts. Thermal noise must remain zero in this version. Standard temperatures include room 22°C, skin 33°C, clothing 28°C, laptops 42°C, and coffee 58°C.

The planner uses global scene oracle positions, independent of camera visibility. It constructs an inflated 0.1 m occupancy grid, uses eight-connected A* without diagonal corner cutting, prunes only clear segments, and checks the physical footprint during every movement substep. Candidate goals lie on a 1 m ring around each person. Nearest unreachable people are skipped in favor of a reachable unvisited person; if none remain reachable, the robot stops. Explicit human-position changes trigger replanning on the next tick. Walking positions trigger replanning at approximately 0.1 m intervals, with clearance checked every movement step.

## Browser API

The same engine used by the interface is available as `window.robotc`:

```js
robotc.reset(); // fresh random activities
robotc.reset(9); // optional seed for reproducible activities
robotc.step(0.2, 0, 0, 0.1); // vx, vy (m/s), yaw rate (rad/s), dt (0–1 s)
robotc.approach();
robotc.pause();
robotc.setHumanPosition('person 1', -2.2, -0.3);
const observation = robotc.observe(); // independent copy of arrays + metadata
const state = robotc.state;          // robot, humans, task, tour
const metrics = robotc.metrics;
```

`setHumanPosition()` makes that person standing until the next reset.

`observe()` returns `depth` and `thermal` frames containing width, height, Float32Array values, Uint8Array validity, and RGBA preview bytes, plus metadata. Snapshots contain `depth_m.npy`, `depth_valid.npy`, `thermal_c.npy`, `thermal_valid.npy`, two preview PNGs, and `metadata.json`. Metadata includes common simulation time, capture date, robot pose, units, calibration K and T_world_camera, oracle humans with activities, animation clocks and walking routes, activity seed, task/tour state, and configuration. Camera coordinates are right/down/forward. No frames are uploaded or automatically recorded.

## Verify

```sh
npm test
npm run build
npm run preview
```

Open `/?test=1` on the preview server to run GPU sensor and scene checks. Open `/?test=1&benchmark=600` to run a ten-minute standard tour followed by a one-minute low-power tour, then download the report at the bottom of the page. Keep the tab visible and focused throughout the benchmark; the regular pause-on-focus-loss rule remains active. Reports show actual wall/simulation time, rate, visit order, resource counts, and JavaScript heap size when the browser exposes it. Heap measurements are not total browser memory.

## Publish on GitHub Pages

Create the public repository `YESAndy/RoboTC` and push this folder's contents to its `master` branch. In **Settings → Pages → Build and deployment**, select **GitHub Actions**. The included workflow runs tests and a production build, then deploys static files. Assets use relative URLs so the site works under `/RoboTC/`. Pull requests run validation without deployment.

No Blender files, reference photos, local snapshots, account credentials, or original project sources belong in the public repository. See `THIRD_PARTY_NOTICES.md` for dependencies.

## Research introduction

The page includes the RoboTC poster introduction, hardware, collection pipeline, dataset activity table, detection results, and approach results. Static content lives in `src/research.ts`; the supplied hardware image is in `public/research/`. Reported research results are distinguished from the oracle-based browser demo. The poster reports 13 activity categories while the supplied reference table has 14 rows; the page preserves both and notes the discrepancy.

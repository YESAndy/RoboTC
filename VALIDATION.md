# RoboTC web validation

Validated on the target Apple M2 Pro Mac on 2026-09-29.

## Automated checks

- 19 passing unit tests cover manual motion, speed limits, collision prevention, repeated human visits, dwell and pause, moved-person replanning, full reset, no-human/no-path cases, unreachable-person fallback, occupancy-safe segments, NPY encoding, triangle budget, and camera calibration.
- GPU checks verify 2.5 m and 4.5 m forward-axis depth, 42°C/80°C visible temperatures, occlusion, invalid masks/NaNs, rotated cameras, clipping, pixel orientation, and calibration.
- Scene checks complete person 1 → person 2 → person 1 → person 2, and reset both person roots and edited body parts.
- TypeScript and production build pass. Dependency audit reports no known vulnerabilities after patch updates.

## Final-build checks

- Independent CPU raycasts agree with GPU observations: depth maximum sampled error 0.0001441 m (129 valid samples), thermal error 0°C (139 valid samples), no validity mismatches.
- Browser controls checked: Approach starts the route, W takes manual control and clears the target, Space stops, switching focus to the preset control pauses, low-power resolution switches to 160×120 depth and 80×60 thermal.

## Activity update checks

- All six activities occur across deterministic seeds; resetting the same seed reproduces poses and clears edited positions.
- Walking reverses at lane endpoints, avoids furniture, yields near the robot, and freezes while paused. All visible body parts and props fit their navigation envelopes.
- 24 randomized scenarios complete at least four consecutive visits without collision. Exact segment/occupied-cell intersection checks prevent tiny grid-corner clips.
- Updated production build and all 15 browser GPU/scene checks pass in Chromium 154.
- Browser reset was verified with walking and typing people. A short interactive tour completed four visits by 41.8 simulated seconds; the displayed rolling sensor rate was 5.0 Hz in standard mode and approximately 2 Hz after switching to low power. This is a smoke check, not a sustained memory benchmark. The full ten-minute benchmark below is historical and has not been repeated for the activity update. Safari remains unverified.

## Historical browser measurements (before activities)

Measured in the Chromium 154 in-app browser on the target Mac:

| Preset | Wall time | Captures | Rate | Human visits | Blocked routes |
|---|---:|---:|---:|---:|---:|
| Standard | 600.001 s | 2,988 | 4.980 Hz | 64 | 0 |
| Low power | 60.984 s | 122 | 2.001 Hz | 6 | 0 |

The standard run advanced 596.0 simulated seconds; missed simulation time is capped to preserve responsiveness. Both runs continuously alternated people without manual resets between visits. Geometry stayed at 126 GPU geometries and two render textures (6,016 triangles in the sampled render pass).

Observed JavaScript heap: standard start 38.33 MB, end 22.82 MB, sampled peak 44.26 MB; low-power start 22.82 MB, end 21.10 MB, peak 29.86 MB. These are browser-reported heap measurements, not total browser or GPU memory. They show no sustained growth over this test. Standard mean capture duration over the retained last 600 captures was 5.94 ms. The low-power capture-duration window included samples from the preceding run and is not reported as a standalone latency result.

The recorded benchmark predates a dependency patch update, optional browser-agent tools, additional raycast tests, and a keyboard-modifier guard; the activity update additionally changes human geometry and navigation. These measurements do not establish performance of the new activities.

## Reproduce

Run `npm test` and `npm run build`. Start `npm run preview`, then open `/?test=1` for GPU checks or `/?test=1&benchmark=600` for the standard ten-minute tour followed by a one-minute low-power run. Keep the browser tab visible and the driving area focused. The benchmark report is downloadable from the page when complete.

## Research page update — 2026-10-01

- Production build and all 19 existing unit tests pass.
- All 15 browser GPU/scene checks pass in Chromium 154; no console errors observed.
- Desktop and 390 px narrow layouts checked; no page-wide horizontal overflow. Section links work, one H1 is present, and tables expose row/column headings.
- Approach continued through multiple visits; Reset cleared visits and hid the speech bubble. The brief arrival bubble was not captured during this smoke check.
- All supplied reference activity rows and detection metrics were transcribed. The page explicitly notes the poster's 13-category total versus the reference table's 14 rows.
- Research content is inserted before WebGL initialization and remains independent of simulator startup. No new dependencies or simulation API changes.

// Research content transcribed from the supplied RoboTC poster and activity table.
const activities = [
  ["Resting", "Sleeping", "0.7"],
  ["Resting", "Reclining", "0.8"],
  ["Resting", "Seated, quiet", "1.0"],
  ["Resting", "Standing, relaxed", "1.2"],
  ["Walking on level surface", "0.9 m/s · 3.2 km/h · 2.0 mph", "2.0"],
  ["Walking on level surface", "1.2 m/s · 4.3 km/h · 2.7 mph", "2.6"],
  ["Walking on level surface", "1.8 m/s · 6.8 km/h · 4.2 mph", "3.8"],
  ["Office activities", "Reading, seated", "1.0"],
  ["Office activities", "Writing", "1.0"],
  ["Office activities", "Typing", "1.1"],
  ["Office activities", "Filing, seated", "1.2"],
  ["Office activities", "Filing, standing", "1.4"],
  ["Office activities", "Walking about", "1.7"],
  ["Office activities", "Lifting/packing", "2.1"],
];
const arrow =
  '<svg class="flow-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
export const researchIntro = `
<section class="research-intro" aria-labelledby="research-title">
  <div class="eyebrow">ROBOTICS × HUMAN COMFORT</div>
  <h1 id="research-title">RoboTC: a robotic platform for privacy-aware active thermal comfort data collection</h1>
  <p class="research-lead">Understanding a room starts with the people in it. RoboTC brings thermal and depth sensing to occupants, pairing environmental observations with their own thermal comfort feedback.</p>
  <p class="research-authors">Weijia Cai <span>·</span> Zhengbo Zou</p>
  <nav class="research-links" aria-label="Page sections"><a class="research-cta" href="#demo">Try the demo <span aria-hidden="true">↗</span></a><a href="#research">Explore the research <span aria-hidden="true">↓</span></a></nav>
</section>`;
export const researchSections = `
<section id="research" class="research-section" aria-labelledby="research-heading" tabindex="-1">
  <div class="research-section-title"><div><div class="eyebrow">BEHIND THE DEMO</div><h2 id="research-heading">From room measurements to human feedback.</h2></div><p>Platform, dataset, and findings from the RoboTC research poster.</p></div>
  <p class="research-note"><strong>Research &amp; simulation.</strong> The findings below describe the research platform. The browser demo uses oracle human locations, ideal depth, and assigned surface temperatures; it does not run the trained detector or measure real thermal comfort.</p>
  <div class="research-grid">
    <article class="research-card"><span class="section-number">01 / CONTEXT</span><h3>Why thermal comfort data?</h3><p>The poster reports that buildings account for <strong>33% of global energy</strong> and HVAC uses <strong>38% of building energy</strong>. Without timely, comprehensive comfort data, HVAC control commonly remains conservative.</p><p>Studies cited in the poster suggest <strong>16–32% energy savings</strong> may be possible using thermal comfort data that combines objective measurements with subjective feedback.</p><p class="research-caption">Energy figures and savings potential are cited background findings in the supplied poster, not savings measured by this demo.</p></article>
    <article class="research-card"><span class="section-number">02 / RESEARCH GAP</span><h3>Move beyond fixed measurements.</h3><div class="table-scroll" role="region" aria-label="Research gap comparison" tabindex="0"><table class="research-table gap-table"><thead><tr><th scope="col">Data</th><th scope="col">Passive / predefined</th><th scope="col">Active</th></tr></thead><tbody><tr><th scope="row">Objective environment</th><td><strong>Fixed sensors / predefined routes</strong><br>Costly to adapt to different building layouts.</td><td><strong>Goal-oriented robotic exploration</strong><br>Planned paths focus on objective measurements.</td></tr><tr><th scope="row">Subjective occupant feedback</th><td><strong>Human inspector</strong><br>Time-consuming, error-prone, and hard to scale.</td><td class="highlight-cell"><strong>RoboTC</strong><br>Actively approaches occupants to collect thermal comfort responses.</td></tr></tbody></table></div></article>
    <article class="research-card research-wide"><span class="section-number">03 / CONTRIBUTIONS</span><h3>One platform, three contributions.</h3><ol class="contribution-list"><li><strong>Active collection</strong><p>A mobile robot platform for actively collecting human thermal preferences.</p></li><li><strong>Multimodal dataset</strong><p>Annotated depth and registered thermal image pairs for human detection training and testing.</p></li><li><strong>Privacy-aware perception</strong><p>A human detector based on depth and thermal images only.</p></li></ol></article>
    <article class="research-card research-wide"><span class="section-number">04 / HARDWARE</span><h3>A mobile sensing and interaction platform.</h3><div class="hardware-layout"><figure><img src="./research/hardware.png" alt="RoboTC cart with depth and thermal cameras on a sensor mast, LiDAR, a three-key keyboard, laptop, power station, and LeKiwi mobile base, numbered one through seven." loading="lazy" width="1205" height="1088"><figcaption>The research hardware. The browser cart is an approximate geometric model.</figcaption></figure><ol class="hardware-list"><li><strong>RealSense D455 depth camera</strong><span>Geometric observations of the scene.</span></li><li><strong>Thermal imaging camera</strong><span>Thermal observations of visible surfaces.</span></li><li><strong>Unitree L2 LiDAR</strong><span>Spatial sensing on the research platform.</span></li><li><strong>Three-key keyboard</strong><span>Hot, OK, and cold occupant feedback.</span></li><li><strong>Laptop</strong><span>Computing and audio input/output.</span></li><li><strong>Power station</strong><span>Onboard power supply.</span></li><li><strong>LeKiwi mobile base</strong><span>Mobility through indoor spaces.</span></li></ol></div></article>
    <article class="research-card research-wide"><span class="section-number">05 / COLLECTION PIPELINE</span><h3>Sense. Find. Approach. Ask.</h3><ol class="collection-flow">${[
      ["Sense", "Depth + thermal images"],
      ["Detect", "Privacy-aware human detection"],
      ["Localize", "Human position in the map"],
      ["Approach", "Collision-aware path planning"],
      ["Ask", "Audio + keyboard feedback"],
    ]
      .map(
        ([title, body], i) =>
          `<li><strong>${title}</strong><span>${body}</span>${i < 4 ? arrow : ""}</li>`,
      )
      .join(
        "",
      )}</ol><p class="research-caption">The robot brings the sensing platform to a person and pairs observations with their reported thermal preference.</p></article>
    <article class="research-card research-wide"><span class="section-number">06 / THERMAL-DEPTH DATASET</span><h3>Everyday activities, across indoor spaces.</h3><div class="dataset-stats"><div><strong>12,788</strong><span>thermal-depth pairs</span></div><div><strong>13</strong><span>indoor activity categories</span></div><div><strong>19</strong><span>locations</span></div></div><p>Depth annotations and registered thermal images support human detection across different postures and activities. The activity labels below follow the supplied table. The poster reports 13 dataset categories; the reference table lists 14 activity rows, all retained here.</p><div class="table-scroll" role="region" aria-label="Dataset activity categories" tabindex="0"><table class="research-table activity-table"><caption>Dataset categories and typical metabolic rates</caption><thead><tr><th scope="col">Group</th><th scope="col">Activity</th><th scope="col">MET</th></tr></thead><tbody>${activities.map(([group, activity, met]) => `<tr><td>${group}</td><th scope="row">${activity}</th><td>${met}</td></tr>`).join("")}</tbody></table></div><p class="research-caption">MET expresses metabolic rate relative to quiet sitting (1 MET). These are reference values from the supplied table, not measurements from the simulation. The demo animates a subset of six activities.</p></article>
    <article class="research-card"><span class="section-number">07 / DETECTION MODEL</span><h3>Two modalities, one human mask.</h3><p>Separate YOLO26 backbones process depth (with its validity map) and thermal images. Each branch produces logits followed by softmax; an AND operator combines the outputs into a human probability mask.</p><div class="model-flow" role="img" aria-label="Depth and depth validity map flow through a YOLO26 backbone, depth logits and softmax. Thermal flows through a second YOLO26 backbone, thermal logits and softmax. The two branches join with an AND operator to form a human probability mask."><div><strong>Depth + validity</strong><span>YOLO26 → logits → softmax</span></div><div><strong>Thermal</strong><span>YOLO26 → logits → softmax</span></div><p>↓ &nbsp; AND fusion &nbsp; ↓</p><div class="model-output">Human probability mask</div></div><p class="research-caption">Research model architecture transcribed from the poster. No RGB input is used.</p></article>
    <article class="research-card"><span class="section-number">08 / DETECTION RESULTS</span><h3>Evaluated in unseen locations.</h3><div class="table-scroll" role="region" aria-label="Human detection results" tabindex="0"><table class="research-table"><caption>Poster test results · 5 unseen locations</caption><thead><tr><th scope="col">Model</th><th scope="col">IoU</th><th scope="col">Precision</th><th scope="col">Recall</th></tr></thead><tbody><tr class="highlight-row"><th scope="row">Ensemble (RoboTC)</th><td><strong>0.746</strong></td><td>91.5%</td><td>80.1%</td></tr><tr><th scope="row">Depth only</th><td>0.739</td><td><strong>92.8%</strong></td><td>78.5%</td></tr><tr><th scope="row">Thermal only</th><td>0.642</td><td>77.4%</td><td>79.0%</td></tr><tr><th scope="row">Early fusion</th><td>0.727</td><td>87.7%</td><td><strong>81.0%</strong></td></tr></tbody></table></div><p>Combining depth and thermal information achieves the highest intersection-over-union (IoU) among the reported models. Accurate localization supports choosing appropriate navigation goals.</p></article>
    <article class="research-card research-wide approach-result"><div><span class="section-number">09 / HUMAN-AWARE APPROACHING</span><h3>Close enough to ask. Planned to approach safely.</h3><p>The platform localizes a detected person, plans a path through the occupancy map, and checks occupancy while following its waypoints. The poster demonstrates both successful and failed approach examples.</p><p>The browser demo illustrates this interaction with oracle-guided visits, a roughly one-meter stand-off, and the question “How do you feel about the temperature?”</p></div><div class="result-stat"><strong>90%</strong><span>human-approach success rate</span><small>Reported in the research poster</small></div></article>
  </div><p class="research-source">Source: supplied RoboTC research poster by Weijia Cai and Zhengbo Zou, and supplied “Metabolic Rates for Typical Tasks” table. Research results are reproduced as reported.</p>
</section>`;

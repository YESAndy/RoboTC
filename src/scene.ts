import * as T from "three";
import type { Config, Human, Obstacle, Pose } from "./core";
export class Office {
  scene = new T.Scene();
  robot = new T.Group();
  people = new Map<string, T.Group>();
  obstacles: Obstacle[] = [];
  humans: Human[] = [];
  meshes: T.Mesh[] = [];
  route = new T.Line(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: 0x30b996, depthTest: false }),
  );
  initial = new Map<
    T.Object3D,
    { p: T.Vector3; q: T.Quaternion; s: T.Vector3 }
  >();
  materials = new Map<string, T.MeshStandardMaterial>();
  palette: Record<string, string> = {
    ink: "#18212b",
    steel: "#485762",
    oak: "#ba8b59",
    teal: "#337e7d",
    navy: "#223e57",
    screen: "#4ca6c0",
    ceramic: "#e0e3d8",
    coffee: "#422d21",
    skin: "#b87c5b",
    shirt: "#668ba6",
    yellow: "#efc343",
    orange: "#dc662b",
    camera: "#348699",
    lens: "#071c25",
    battery: "#465149",
    wall: "#c4d0cb",
    accent: "#375b61",
    floor: "#859799",
    window: "#7db4c6",
    leaf: "#448366",
  };
  constructor(public config: Config) {
    this.scene.background = new T.Color("#edf2ee");
    this.scene.add(new T.HemisphereLight(0xffffff, 0x727c77, 2.2));
    const light = new T.DirectionalLight(0xffffff, 2.5);
    light.position.set(-3, -5, 9);
    this.scene.add(light);
    this.route.layers.set(0);
    this.route.renderOrder = 5;
    this.scene.add(this.route);
    this.build();
    this.people.forEach((root) =>
      root.traverse((o) =>
        this.initial.set(o, {
          p: o.position.clone(),
          q: o.quaternion.clone(),
          s: o.scale.clone(),
        }),
      ),
    );
  }
  finish(
    g: T.BufferGeometry,
    p: number[],
    mat: string,
    temp = "room",
    parent: T.Object3D = this.scene,
  ) {
    let m = this.materials.get(mat);
    if (!m) {
      m = new T.MeshStandardMaterial({
        color: this.palette[mat],
        roughness: 0.85,
      });
      this.materials.set(mat, m);
    }
    const mesh = new T.Mesh(g, m);
    mesh.position.set(p[0], p[1], p[2]);
    mesh.userData.temperature = this.config.temperatures_c[temp];
    mesh.layers.enable(1);
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }
  box(
    p: number[],
    s: number[],
    mat: string,
    temp = "room",
    parent?: T.Object3D,
  ) {
    return this.finish(
      new T.BoxGeometry(...(s as [number, number, number])),
      p,
      mat,
      temp,
      parent,
    );
  }
  cylinder(
    p: number[],
    r: number,
    h: number,
    mat: string,
    temp = "room",
    parent?: T.Object3D,
  ) {
    const g = new T.CylinderGeometry(r, r, h, 16);
    g.rotateX(Math.PI / 2);
    return this.finish(g, p, mat, temp, parent);
  }
  sphere(
    p: number[],
    s: number[],
    mat: string,
    temp = "room",
    parent?: T.Object3D,
  ) {
    const g = new T.SphereGeometry(1, 16, 8);
    g.scale(s[0], s[1], s[2]);
    return this.finish(g, p, mat, temp, parent);
  }
  obstacle(x: number, y: number, w: number, d: number, name: string) {
    this.obstacles.push([x - w / 2, y - d / 2, x + w / 2, y + d / 2, name]);
  }
  desk(x: number, y: number, id: number) {
    this.box([x, y, 0.76], [1.7, 0.75, 0.07], "oak");
    for (const dx of [-0.7, 0.7])
      for (const dy of [-0.25, 0.25])
        this.box([x + dx, y + dy, 0.36], [0.055, 0.055, 0.72], "steel");
    this.obstacle(x, y, 1.7, 0.75, "desk " + id);
    this.box([x + 0.28, y + 0.1, 0.815], [0.3, 0.2, 0.04], "ink");
    this.box([x + 0.28, y + 0.18, 1], [0.045, 0.05, 0.35], "steel");
    this.box([x + 0.28, y + 0.18, 1.21], [0.64, 0.055, 0.39], "ink", "monitor");
    this.box(
      [x + 0.28, y + 0.146, 1.21],
      [0.59, 0.012, 0.34],
      "screen",
      "monitor",
    );
    this.box(
      [x - 0.46, y - 0.05, 0.815],
      [0.4, 0.27, 0.025],
      "steel",
      "laptop",
    );
    this.box(
      [x - 0.46, y + 0.065, 0.94],
      [0.4, 0.02, 0.24],
      "ink",
      "laptop",
    ).rotation.x = -Math.PI / 15;
    this.cylinder([x + 0.68, y - 0.14, 0.87], 0.055, 0.14, "ceramic", "coffee");
    this.cylinder(
      [x + 0.68, y - 0.14, 0.942],
      0.044,
      0.005,
      "coffee",
      "coffee",
    );
    const cy = y - 0.95;
    this.box([x, cy, 0.48], [0.5, 0.49, 0.12], "teal");
    this.box([x, cy - 0.22, 0.84], [0.5, 0.085, 0.6], "teal");
    this.cylinder([x, cy, 0.25], 0.045, 0.45, "steel");
    this.box([x, cy, 0.07], [0.57, 0.1, 0.055], "steel");
    this.box([x, cy, 0.07], [0.1, 0.57, 0.055], "steel");
    this.obstacle(x, cy, 0.6, 0.6, "chair " + id);
  }
  person(x: number, y: number, id: number) {
    const root = new T.Group();
    root.position.set(x, y, 0);
    this.scene.add(root);
    this.people.set("person " + id, root);
    this.humans.push({ id: "person " + id, position: [x, y] });
    for (const dx of [-0.11, 0.11]) {
      this.box([dx, -0.06, 0.055], [0.14, 0.28, 0.11], "ink", "room", root);
      this.box([dx, 0, 0.49], [0.16, 0.19, 0.82], "navy", "clothing", root);
    }
    this.sphere([0, 0, 1.13], [0.27, 0.17, 0.36], "shirt", "clothing", root);
    for (const dx of [-0.3, 0.3]) {
      this.sphere(
        [dx, 0, 1.12],
        [0.095, 0.11, 0.28],
        "shirt",
        "clothing",
        root,
      );
      this.sphere([dx, 0, 0.87], [0.065, 0.075, 0.1], "skin", "skin", root);
    }
    this.cylinder([0, 0, 1.47], 0.065, 0.12, "skin", "skin", root);
    this.sphere([0, 0, 1.64], [0.13, 0.12, 0.17], "skin", "skin", root);
    this.sphere([0, 0.015, 1.75], [0.132, 0.12, 0.07], "ink", "clothing", root);
  }
  buildRobot() {
    const r = this.robot;
    this.scene.add(r);
    this.box([0, 0, 0.1], [0.53, 0.43, 0.1], "ink", "room", r);
    for (const x of [-0.21, 0.21])
      for (const y of [-0.18, 0.18])
        this.cylinder(
          [x, y, 0.06],
          0.058,
          0.035,
          "steel",
          "room",
          r,
        ).rotation.x = Math.PI / 2;
    for (const z of [0.25, 0.65, 1]) {
      this.box([0, 0, z], [0.5, 0.41, 0.04], "ink", "room", r);
      for (const y of [-0.19, 0.19])
        this.box([0, y, z + 0.07], [0.5, 0.025, 0.12], "ink", "room", r);
    }
    for (const x of [-0.22, 0.22])
      for (const y of [-0.17, 0.17])
        this.cylinder([x, y, 0.64], 0.018, 1, "steel", "room", r);
    this.box([-0.03, 0, 0.41], [0.26, 0.25, 0.28], "battery", "room", r);
    this.box([0.107, 0, 0.43], [0.01, 0.14, 0.1], "screen", "room", r);
    this.box([0, 0, 0.7], [0.4, 0.34, 0.035], "navy", "laptop", r);
    this.box(
      [-0.15, 0, 0.83],
      [0.02, 0.34, 0.25],
      "ink",
      "laptop",
      r,
    ).rotation.y = -0.15;
    this.box([0, 0, 1.12], [0.5, 0.41, 0.035], "yellow", "room", r);
    for (const y of [-0.18, 0.18])
      this.box([0, y, 1.075], [0.48, 0.04, 0.12], "yellow", "room", r);
    this.box([0.1, 0, 1.235], [0.055, 0.07, 0.23], "orange", "room", r);
    this.box([0.1, 0, 1.35], [0.07, 0.27, 0.065], "camera", "room", r);
    for (const y of [-0.1, 0, 0.1])
      this.box([0.14, y, 1.35], [0.008, 0.04, 0.035], "lens", "room", r);
    this.box([0.11, 0, 1.25], [0.07, 0.075, 0.07], "yellow", "room", r);
    this.box([0.15, 0, 1.25], [0.008, 0.038, 0.038], "lens", "room", r);
    this.cylinder([0, 0, 1.17], 0.05, 0.05, "ink", "room", r);
    const c = this.config.robot;
    r.scale.set(c.length_m / 0.55, c.width_m / 0.45, c.height_m / 1.4);
  }
  build() {
    const { width_m: w, depth_m: d, height_m: h } = this.config.room;
    this.box([0, 0, -0.08], [w + 0.2, d + 0.2, 0.16], "floor");
    for (const [x, y, ww, dd, name, hide] of [
      [0, d / 2, w, 0.12, "North wall", false],
      [0, -d / 2, w, 0.12, "South wall", true],
      [-w / 2, 0, 0.12, d, "West wall", true],
      [w / 2, 0, 0.12, d, "East wall", false],
    ] as [number, number, number, number, string, boolean][]) {
      const wall = this.box([x, y, h / 2], [ww, dd, h], "wall");
      if (hide) wall.layers.set(1);
      this.obstacle(x, y, ww, dd, name);
    }
    this.box([-1.8, d / 2 - 0.08, 1.65], [2.6, 0.06, 1.4], "accent");
    this.box(
      [-1.8, d / 2 - 0.12, 1.65],
      [2.43, 0.02, 1.25],
      "window",
      "window",
    );
    this.box([-1.8, d / 2 - 0.15, 1.65], [0.045, 0.04, 1.25], "ceramic");
    this.desk(-1.5, 2.05, 1);
    this.desk(1.3, 2.05, 2);
    for (const y of [-0.6, 0.55]) {
      this.box([3.6, y, 0.62], [0.6, 0.9, 1.24], "ceramic");
      for (const z of [0.25, 0.65, 1.05])
        this.box([3.285, y, z], [0.025, 0.84, 0.025], "steel");
      this.obstacle(3.6, y, 0.6, 0.9, "storage cabinet");
    }
    this.person(-0.05, 1.18, 1);
    this.person(1.35, -2.35, 2);
    this.cylinder([-3.45, 2.4, 0.2], 0.23, 0.4, "ceramic");
    for (const [z, dx] of [
      [0.6, 0],
      [0.85, -0.13],
      [1.1, 0.08],
    ])
      this.sphere([-3.45 + dx, 2.4, z], [0.28, 0.22, 0.28], "leaf");
    this.obstacle(-3.45, 2.4, 0.6, 0.6, "planter");
    for (let x = -3; x <= 3; x++)
      this.box([x, 0, 0.001], [0.008, d, 0.001], "steel");
    for (let y = -2; y <= 2; y++)
      this.box([0, y, 0.001], [w, 0.008, 0.001], "steel");
    this.buildRobot();
  }
  sync(p: Pose, humans: Human[]) {
    this.robot.position.set(p[0], p[1], 0);
    this.robot.rotation.z = p[2];
    for (const h of humans)
      this.people.get(h.id)?.position.set(h.position[0], h.position[1], 0);
    this.scene.updateMatrixWorld(true);
  }
  resetPeople() {
    this.initial.forEach((t, o) => {
      o.position.copy(t.p);
      o.quaternion.copy(t.q);
      o.scale.copy(t.s);
    });
  }
  setRoute(points: number[][]) {
    this.route.geometry.dispose();
    this.route.geometry = new T.BufferGeometry().setFromPoints(
      points.map((p) => new T.Vector3(p[0], p[1], 0.035)),
    );
  }
}

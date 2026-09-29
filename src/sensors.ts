import * as T from "three";
import type { Config, CameraSpec, Pose } from "./core";
export type Frame = {
  width: number;
  height: number;
  values: Float32Array;
  valid: Uint8Array;
  preview: Uint8ClampedArray;
};
export function cameraFor(pose: Pose, spec: CameraSpec, size: number[]) {
  const yaw = pose[2],
    az = yaw + (spec.yaw_deg * Math.PI) / 180,
    el = (spec.pitch_deg * Math.PI) / 180,
    m = spec.mount_m;
  const camera = new T.PerspectiveCamera(
    (2 *
      Math.atan(
        (Math.tan((spec.hfov_deg * Math.PI) / 360) * size[1]) / size[0],
      ) *
      180) /
      Math.PI,
    size[0] / size[1],
    spec.near_m,
    spec.far_m,
  );
  camera.up.set(0, 0, 1);
  camera.position.set(
    pose[0] + m[0] * Math.cos(yaw) - m[1] * Math.sin(yaw),
    pose[1] + m[0] * Math.sin(yaw) + m[1] * Math.cos(yaw),
    m[2],
  );
  camera.lookAt(
    camera.position
      .clone()
      .add(
        new T.Vector3(
          Math.cos(el) * Math.cos(az),
          Math.cos(el) * Math.sin(az),
          Math.sin(el),
        ),
      ),
  );
  camera.layers.set(1);
  camera.updateMatrixWorld(true);
  return camera;
}
export function calibration(
  camera: T.PerspectiveCamera,
  spec: CameraSpec,
  size: number[],
) {
  const f = size[0] / (2 * Math.tan((spec.hfov_deg * Math.PI) / 360)),
    m = camera.matrixWorld
      .clone()
      .multiply(new T.Matrix4().makeScale(1, -1, -1)).elements;
  return {
    size_wh: size,
    K: [
      [f, 0, (size[0] - 1) / 2],
      [0, f, (size[1] - 1) / 2],
      [0, 0, 1],
    ],
    T_world_camera: Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => m[c * 4 + r]),
    ),
    camera_axes: "x right, y down, z forward",
    pixel_origin: "top left",
    near_m: spec.near_m,
    far_m: spec.far_m,
  };
}
const palettes = {
  depth: [
    [190, 240, 213],
    [71, 167, 188],
    [45, 80, 133],
    [17, 29, 55],
  ],
  thermal: [
    [24, 16, 51],
    [95, 27, 101],
    [188, 54, 84],
    [239, 122, 51],
    [253, 203, 107],
    [255, 246, 213],
  ],
};
export function colorize(
  frame: Frame,
  kind: "depth" | "thermal",
  min: number,
  max: number,
) {
  const colors = palettes[kind];
  for (let i = 0; i < frame.values.length; i++) {
    const j = i * 4;
    if (!frame.valid[i]) {
      frame.preview.set([12, 23, 33, 255], j);
      continue;
    }
    const t =
        Math.max(0, Math.min(1, (frame.values[i] - min) / (max - min))) *
        (colors.length - 1),
      a = Math.min(colors.length - 2, Math.floor(t)),
      f = t - a;
    for (let c = 0; c < 3; c++)
      frame.preview[j + c] = Math.round(
        colors[a][c] * (1 - f) + colors[a + 1][c] * f,
      );
    frame.preview[j + 3] = 255;
  }
}
export class Sensors {
  targets = new Map<string, T.WebGLRenderTarget>();
  buffers = new Map<string, Float32Array>();
  frames = new Map<string, Frame>();
  materials = new Map<number, T.ShaderMaterial>();
  constructor(
    public renderer: T.WebGLRenderer,
    public scene: T.Scene,
    public config: Config,
  ) {
    const gl = renderer.getContext();
    if (
      !renderer.capabilities.isWebGL2 ||
      !gl.getExtension("EXT_color_buffer_float")
    )
      throw Error(
        "RoboTC needs WebGL2 with floating-point rendering. Please enable hardware acceleration or use a current Chrome or Safari browser.",
      );
    const probe = this.target("probe", [1, 1]);
    renderer.setRenderTarget(probe);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    renderer.setRenderTarget(null);
    if (status !== gl.FRAMEBUFFER_COMPLETE)
      throw Error(
        "Floating-point sensor buffers are unavailable on this device.",
      );
    probe.dispose();
    this.targets.delete("probe");
  }
  target(key: string, size: number[]) {
    let target = this.targets.get(key);
    if (!target || target.width !== size[0] || target.height !== size[1]) {
      target?.dispose();
      target = new T.WebGLRenderTarget(size[0], size[1], {
        type: T.FloatType,
        format: T.RGBAFormat,
        minFilter: T.NearestFilter,
        magFilter: T.NearestFilter,
        depthBuffer: true,
        stencilBuffer: false,
      });
      target.texture.colorSpace = T.NoColorSpace;
      this.targets.set(key, target);
      this.buffers.set(key, new Float32Array(size[0] * size[1] * 4));
      this.frames.set(key, {
        width: size[0],
        height: size[1],
        values: new Float32Array(size[0] * size[1]),
        valid: new Uint8Array(size[0] * size[1]),
        preview: new Uint8ClampedArray(size[0] * size[1] * 4),
      });
    }
    return target;
  }
  material(temp: number) {
    let m = this.materials.get(temp);
    if (!m) {
      m = new T.ShaderMaterial({
        uniforms: { temperature: { value: temp } },
        vertexShader:
          "varying float depthM; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);depthM=-p.z;gl_Position=projectionMatrix*p;}",
        fragmentShader:
          "varying float depthM; uniform float temperature; void main(){gl_FragColor=vec4(depthM,temperature,1.0,1.0);}",
        side: T.DoubleSide,
        blending: T.NoBlending,
        toneMapped: false,
      });
      this.materials.set(temp, m);
    }
    return m;
  }
  pass(kind: "depth" | "thermal", pose: Pose) {
    const spec = this.config[kind],
      size =
        this.config.presets[this.config.preset][
          (kind + "_size") as "depth_size" | "thermal_size"
        ],
      camera = cameraFor(pose, spec, size),
      target = this.target(kind, size),
      buffer = this.buffers.get(kind)!,
      frame = this.frames.get(kind)!;
    const replacements: [T.Mesh, T.Material | T.Material[]][] = [];
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh && o.layers.test(camera.layers)) {
        replacements.push([o, o.material]);
        o.material = this.material(o.userData.temperature ?? 22);
      }
    });
    const background = this.scene.background,
      clear = this.renderer.getClearColor(new T.Color()),
      alpha = this.renderer.getClearAlpha(),
      oldTarget = this.renderer.getRenderTarget();
    try {
      this.scene.background = null;
      this.renderer.setClearColor(0, 0);
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
      this.renderer.render(this.scene, camera);
      this.renderer.readRenderTargetPixels(
        target,
        0,
        0,
        size[0],
        size[1],
        buffer,
      );
    } finally {
      for (const [mesh, material] of replacements) mesh.material = material;
      this.scene.background = background;
      this.renderer.setRenderTarget(oldTarget);
      this.renderer.setClearColor(clear, alpha);
    }
    for (let y = 0; y < size[1]; y++)
      for (let x = 0; x < size[0]; x++) {
        const i = y * size[0] + x,
          j = ((size[1] - 1 - y) * size[0] + x) * 4;
        const valid =
          buffer[j + 2] > 0.5 &&
          buffer[j] >= spec.near_m &&
          buffer[j] <= spec.far_m;
        frame.valid[i] = +valid;
        frame.values[i] = valid ? buffer[j + (kind === "depth" ? 0 : 1)] : NaN;
      }
    colorize(
      frame,
      kind,
      kind === "depth" ? spec.near_m : this.config.thermal.display_min_c,
      kind === "depth" ? spec.far_m : this.config.thermal.display_max_c,
    );
    return { frame, calibration: calibration(camera, spec, size) };
  }
  observe(pose: Pose) {
    return {
      depth: this.pass("depth", pose),
      thermal: this.pass("thermal", pose),
    };
  }
  dispose() {
    this.targets.forEach((t) => t.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

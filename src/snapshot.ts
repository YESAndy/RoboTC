import { zipSync, strToU8 } from "fflate";
import type { Frame } from "./sensors";
export function npy(
  values: Float32Array | Uint8Array,
  width: number,
  height: number,
) {
  const type = values instanceof Float32Array ? "<f4" : "|b1",
    base = `{'descr': '${type}', 'fortran_order': False, 'shape': (${height}, ${width}), }`,
    pad = (64 - ((10 + base.length + 1) % 64)) % 64,
    header = base + " ".repeat(pad) + "\n",
    out = new Uint8Array(10 + header.length + values.byteLength);
  out.set([
    147,
    78,
    85,
    77,
    80,
    89,
    1,
    0,
    header.length & 255,
    header.length >> 8,
  ]);
  out.set(strToU8(header), 10);
  const offset = 10 + header.length;
  if (values instanceof Float32Array) {
    const view = new DataView(out.buffer);
    for (let i = 0; i < values.length; i++)
      view.setFloat32(offset + i * 4, values[i], true);
  } else out.set(values, offset);
  return out;
}
export function drawFrame(canvas: HTMLCanvasElement, frame: Frame) {
  if (canvas.width !== frame.width || canvas.height !== frame.height) {
    canvas.width = frame.width;
    canvas.height = frame.height;
  }
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(frame.width, frame.height);
  image.data.set(frame.preview);
  ctx.putImageData(image, 0, 0);
}
async function png(frame: Frame) {
  const c = document.createElement("canvas");
  drawFrame(c, frame);
  const blob = await new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error("PNG encoding failed"))),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
export async function snapshotZip(
  depth: Frame,
  thermal: Frame,
  metadata: unknown,
) {
  return zipSync(
    {
      "depth_m.npy": npy(depth.values, depth.width, depth.height),
      "depth_valid.npy": npy(depth.valid, depth.width, depth.height),
      "thermal_c.npy": npy(thermal.values, thermal.width, thermal.height),
      "thermal_valid.npy": npy(thermal.valid, thermal.width, thermal.height),
      "depth_preview.png": await png(depth),
      "thermal_preview.png": await png(thermal),
      "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
    },
    { level: 3 },
  );
}

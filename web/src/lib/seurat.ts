// .seurat v2 codec — single-file dot animation format.
//
// gzip( header + payload )
//   header (14 bytes): "SEUR" | ver(1) | flags(1) | w(u16) h(u16) fps(u16) frameCount(u16)  (LE)
//   payload: 4-bit-per-channel color (16 levels, v->round(v/17), restore q*17),
//            additive delta per channel ((curr-prev)&15), frame 0 raw, nibble-packed.
//
// Replaces v1 (.meta.json + .neil + .first.neil; XOR-delta, 24-bit): one file,
// additive delta, ~3x smaller.

export interface SeuratMeta {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  format: 'raw';
}

const ungzip = async (input: ArrayBuffer | Blob): Promise<Uint8Array> => {
  const body = input instanceof Blob ? input.stream() : new Response(input).body!;
  const stream = body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

// Encode raw 8-bit RGB frames into a single gzipped .seurat blob.
export async function encodeSeurat(
  meta: { width: number; height: number; fps: number; frameCount: number },
  rgbFrames: Uint8Array[],
): Promise<Blob> {
  const { width: w, height: h, fps, frameCount: N } = meta;
  const per = w * h * 3;
  const payload = new Uint8Array((N * per + 1) >> 1);
  const prevQ = new Uint8Array(per);
  let nib = 0;
  const writeNib = (v: number) => { const idx = nib >> 1; if (nib & 1) payload[idx] |= v & 15; else payload[idx] = (v & 15) << 4; nib++; };
  for (let f = 0; f < N; f++) {
    const fr = rgbFrames[f];
    for (let i = 0; i < per; i++) {
      const q = Math.round(fr[i] / 17);
      writeNib(f === 0 ? q : (q - prevQ[i]) & 15);
      prevQ[i] = q;
    }
  }
  const container = new Uint8Array(14 + payload.length);
  const dv = new DataView(container.buffer);
  container[0] = 0x53; container[1] = 0x45; container[2] = 0x55; container[3] = 0x52; // SEUR
  container[4] = 2;
  container[5] = N > 1 ? 1 : 0;
  dv.setUint16(6, w, true);
  dv.setUint16(8, h, true);
  dv.setUint16(10, fps, true);
  dv.setUint16(12, N, true);
  container.set(payload, 14);
  const stream = new Blob([container as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

// Parse the gunzipped container into metadata + raw 8-bit RGB frames.
export function parseSeurat(container: Uint8Array): { metadata: SeuratMeta; frames: Uint8Array } {
  if (container[0] !== 0x53 || container[1] !== 0x45 || container[2] !== 0x55 || container[3] !== 0x52) {
    throw new Error('not a .seurat file');
  }
  const dv = new DataView(container.buffer, container.byteOffset, container.byteLength);
  const width = dv.getUint16(6, true);
  const height = dv.getUint16(8, true);
  const fps = dv.getUint16(10, true);
  const frameCount = dv.getUint16(12, true);
  const per = width * height * 3;
  const payload = container.subarray(14);

  const frames = new Uint8Array(frameCount * per);
  const prevQ = new Uint8Array(per);
  let cur = 0;
  for (let f = 0; f < frameCount; f++) {
    const base = f * per;
    if (f === 0) {
      for (let i = 0; i < per; i++) {
        const byte = payload[cur >> 1];
        const q = (cur & 1) ? (byte & 15) : (byte >> 4);
        cur++;
        prevQ[i] = q;
        frames[base + i] = q * 17;
      }
    } else {
      for (let i = 0; i < per; i++) {
        const byte = payload[cur >> 1];
        const q = (prevQ[i] + ((cur & 1) ? (byte & 15) : (byte >> 4))) & 15;
        cur++;
        prevQ[i] = q;
        frames[base + i] = q * 17;
      }
    }
  }
  return { metadata: { width, height, fps, frameCount, format: 'raw' }, frames };
}

// Decode a fetched/uploaded .seurat (gzip) blob or buffer.
export async function decodeSeurat(input: ArrayBuffer | Blob): Promise<{ metadata: SeuratMeta; frames: Uint8Array }> {
  return parseSeurat(await ungzip(input));
}

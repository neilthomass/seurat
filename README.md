# Seurat

Turn video into pointillist dot animations, entirely in the browser.

The conversion core is C++ compiled to WebAssembly; the interface is a React +
Vite + Tailwind app, and the player is a small, framework-agnostic module.

## Layout

- `src/converter.cpp` — the dot converter core (C++23 → WASM). Per-frame pixel
  pipeline: contrast/exposure → auto-levels → white-threshold → pixel masking →
  packed `w*h*3` RGB.
- `src/build.sh` — compiles the core with Emscripten into `web/src/wasm/`.
- `web/` — the React app.
  - `src/lib/converter.ts` — browser glue: decodes a video, downscales each
    frame, runs it through the WASM core, packs the `.neil` format.
  - `src/lib/player.ts` — importable `DotPlayer` that renders `.neil` to a canvas.
  - `src/pages/` — Converter (with a live Source · Dots preview), Player, About.

## Format

- `<base>.meta.json` — `{ width, height, fps, frameCount, format }`
- `<base>.neil` — gzipped `w*h*3` RGB frames; `format: 'delta'` XORs each frame
  against the previous one.
- `<base>.first.neil` — gzipped first frame, for a fast initial paint.

## Develop

```bash
cd web
npm install
npm run dev
```

## Rebuild the WASM core

The compiled artifact (`web/src/wasm/converter.js`) is checked in, so the app
builds without a C++ toolchain. To rebuild it, install the public Emscripten SDK
(<https://github.com/emscripten-core/emsdk>) and run:

```bash
src/build.sh
```

## Using the player elsewhere

```ts
import { DotPlayer } from './lib/player';

const player = new DotPlayer(document.querySelector('canvas')!);
await player.loadUrl('/creation'); // /creation.meta.json + /creation.neil
player.play();
```

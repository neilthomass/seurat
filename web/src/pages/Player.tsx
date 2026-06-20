import { useEffect, useRef, useState } from 'react';
import Hero from '../components/Hero.tsx';
import { DotPlayer } from '../lib/player.ts';
import type { SeuratMeta } from '../lib/seurat.ts';

export interface Animation {
  meta: SeuratMeta;
  frames: Uint8Array;
}

export default function Player({ initial, onBack }: { initial: Animation | null; onBack: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [total, setTotal] = useState(1);
  const [fps, setFps] = useState(12);
  const [pops, setPops] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<DotPlayer | null>(null);

  const adopt = (player: DotPlayer) => {
    setLoaded(true);
    setPlaying(false);
    setFrame(0);
    setPops(0);
    setTotal(player.meta!.frameCount);
    setFps(player.fps);
  };

  useEffect(() => {
    if (!initial) return;
    const player = (playerRef.current ??= new DotPlayer(canvasRef.current!, { onPop: setPops }));
    player.setData(initial.meta, initial.frames);
    adopt(player);
    player.play();
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => playerRef.current?.destroy(), []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const p = playerRef.current;
      if (p) setFrame(p.frame);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const player = (playerRef.current ??= new DotPlayer(canvasRef.current!, { onPop: setPops }));
      await player.loadFile(file);
      adopt(player);
    } catch {
      setError('Could not read that file pair.');
    }
  };

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    p.toggle();
    setPlaying(p.playing);
  };

  const seek = (i: number) => {
    playerRef.current?.pause();
    setPlaying(false);
    playerRef.current?.seek(i);
    setFrame(i);
  };

  const changeFps = (v: number) => {
    setFps(v);
    playerRef.current?.setFps(v);
  };

  const reset = () => {
    playerRef.current?.resetPops();
    setPops(0);
  };

  return (
    <div className="py-12">
      <button className="label mb-8 inline-flex items-center gap-2 hover:text-ink" onClick={onBack}>
        <span aria-hidden>&larr;</span> Converter
      </button>

      <Hero eyebrow="Playback" title="Pop the dots." subtitle="Press play, then click or drag across the animation." />

      <div className="card card-raised overflow-hidden p-3 sm:p-4" style={{ display: loaded ? 'block' : 'none' }}>
        <canvas ref={canvasRef} className="w-full rounded-xl" style={{ display: 'block', cursor: 'crosshair' }} />
      </div>

      {loaded && (
        <div className="mt-6 space-y-7">
          <div className="flex items-center gap-4">
            <button className="btn w-24" onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>
            <input className="slider flex-1" type="range" min={0} max={Math.max(0, total - 1)} value={frame} onChange={(e) => seek(Number(e.target.value))} />
            <span className="mono whitespace-nowrap text-sm text-muted">{String(frame).padStart(2, '0')} / {total - 1}</span>
          </div>

          <div className="grid gap-7 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">Frame rate</span>
                <span className="mono text-sm text-ink">{fps} fps</span>
              </div>
              <input className="slider" type="range" min={1} max={30} value={fps} onChange={(e) => changeFps(Number(e.target.value))} />
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="label block">Dots popped</span>
                <span className="mono mt-1 block text-2xl text-ink">{pops.toLocaleString()}</span>
              </div>
              <button className="btn btn-ghost" onClick={reset} disabled={pops === 0}>Reset</button>
            </div>
          </div>
        </div>
      )}

      <label className="mt-10 block max-w-xl border-t border-line pt-8">
        <span className="label mb-2 block">Or load exported files</span>
        <input className="field" type="file" accept=".seurat" onChange={onFiles} />
        <span className="mt-2 block text-sm text-faint">Choose the .seurat file the converter produced.</span>
      </label>

      {error && <p className="mt-6 text-accent">{error}</p>}
    </div>
  );
}

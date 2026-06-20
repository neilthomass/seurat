import { useState } from 'react';
import Converter from './pages/Converter.tsx';
import Player, { type Animation } from './pages/Player.tsx';

export default function App() {
  const [route, setRoute] = useState<'converter' | 'player'>('converter');
  const [pending, setPending] = useState<Animation | null>(null);

  const play = (anim: Animation | null) => {
    setPending(anim);
    setRoute('player');
  };

  return (
    <main className="mx-auto max-w-6xl px-6">
      {route === 'converter' && <Converter onPlay={play} />}
      {route === 'player' && <Player initial={pending} onBack={() => setRoute('converter')} />}
    </main>
  );
}

export default function Hero({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <header className="mb-10">
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-3 text-lg text-muted">{subtitle}</p>
    </header>
  );
}

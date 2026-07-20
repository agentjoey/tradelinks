import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-24 text-center">
      <span className="font-mono text-2xl text-faint" aria-hidden="true">◇</span>
      <p className="font-display text-headline font-semibold text-ink">This signal never reached the wire.</p>
      <p className="max-w-[42ch] text-meta text-muted">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
      <Link href="/" className="ticker mt-2 rounded-full border border-linestrong px-4 py-2 text-label uppercase text-muted transition-colors hover:border-signal hover:text-signal">← Back to the front page</Link>
    </div>
  );
}

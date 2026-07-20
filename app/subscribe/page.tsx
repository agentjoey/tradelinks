import { SubscribeForm } from "../components/SubscribeForm";

export const metadata = {
  title: "Subscribe — TradeLinks Cross-Border Brief",
  description: "Weekly cross-border e-commerce intelligence: what's moving and why, before your competitors.",
};

export default function SubscribePage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-headline font-semibold text-ink">The Cross-Border Brief</h1>
      <p className="mt-3 text-lede text-muted">
        Weekly — what&apos;s moving in cross-border e-commerce and why, before your competitors. The products
        quietly climbing, and the policy &amp; logistics shifts that hit your margins. Free.
      </p>
      <div className="mt-6">
        <SubscribeForm />
      </div>
      <p className="ticker mt-3 text-label text-faint">Double opt-in. Unsubscribe anytime.</p>
    </main>
  );
}

import { SubscribeForm } from "../../components/SubscribeForm";
import { PageHeader } from "../../components/PageHeader";

export const metadata = {
  title: "Subscribe — TradeLinks Cross-Border Brief",
  description: "Weekly cross-border e-commerce intelligence: what's moving and why, before your competitors.",
};

export default function SubscribePage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <PageHeader
        eyebrow="◆ Subscribe"
        title="The Cross-Border Brief"
        sub="Weekly — what's moving in cross-border e-commerce and why, before your competitors. The products quietly climbing, and the policy & logistics shifts that hit your margins. Free."
      >
        <div className="mt-6">
          <SubscribeForm />
        </div>
        <p className="ticker mt-3 text-label text-faint">Double opt-in. Unsubscribe anytime.</p>
      </PageHeader>
    </main>
  );
}

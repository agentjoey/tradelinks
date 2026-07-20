/** Lead-lag diffusion arc between two region chips (CSS-only animation). */
export function DiffusionArc() {
  return (
    <svg width="36" height="12" viewBox="0 0 36 12" aria-hidden="true" style={{ flex: "none" }}>
      <path className="arc-flow" d="M2 10 Q 18 -3 34 10" fill="none" stroke="rgb(var(--c-signal))" strokeWidth="1.5" />
    </svg>
  );
}

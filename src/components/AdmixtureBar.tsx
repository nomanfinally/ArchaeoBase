"use client";

import { colorForComponent } from "@/lib/admixture/colors";

type Props = {
  value: Record<string, number> | null | undefined;
};

export function AdmixtureBar({ value }: Props) {
  if (!value || !Object.keys(value).length) return <span className="mono">..</span>;

  const entries = Object.entries(value)
    .map(([component, fraction]) => [Number(component), Number(fraction)] as const)
    .filter(([, fraction]) => Number.isFinite(fraction) && fraction > 0)
    .sort(([a], [b]) => a - b);

  return (
    <div className="admixture-bar" aria-label="ADMIXTURE proportions">
      {entries.map(([component, fraction]) => (
        <span
          key={component}
          className="admixture-segment"
          title={`Component ${component}: ${(fraction * 100).toFixed(2)}%`}
          style={{
            width: `${Math.max(fraction * 100, 0.5)}%`,
            backgroundColor: colorForComponent(component)
          }}
        />
      ))}
    </div>
  );
}


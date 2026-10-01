import type { ReactNode } from "react";

interface MetricTileProps {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: "default" | "green" | "blue" | "amber" | "red";
}

export function MetricTile({
  label,
  value,
  note,
  tone = "default"
}: MetricTileProps) {
  return (
    <div className={`metric-tile tone-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

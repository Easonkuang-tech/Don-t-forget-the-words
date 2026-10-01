interface MemoryMeterProps {
  level: number;
}

export function MemoryMeter({ level }: MemoryMeterProps) {
  const safeLevel = Math.max(0, Math.min(6, Math.round(level)));

  return (
    <div className="memory-meter" aria-label={`记忆等级 ${safeLevel}`}>
      <span className="memory-meter-label">L{safeLevel}</span>
      <div className="memory-meter-track" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span
            key={index}
            className={index <= safeLevel ? "is-filled" : ""}
          />
        ))}
      </div>
    </div>
  );
}

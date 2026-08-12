"use client";

import { useId, useState } from "react";

type QuantityStepperProps = {
  value: number;
  min?: number;
  max: number;
  onChange: (quantity: number) => void;
  disabled?: boolean;
  className?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function QuantityStepper({ value, min = 1, max, onChange, disabled = false, className = "" }: QuantityStepperProps) {
  const labelId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? String(value);

  function commit(rawValue: string) {
    const parsed = Number(rawValue);
    const nextValue = Number.isFinite(parsed) ? clamp(parsed, min, max) : value;
    setDraft(null);
    if (nextValue !== value) onChange(nextValue);
  }

  function step(delta: number) {
    const parsed = Number(displayedValue);
    const baseValue = Number.isFinite(parsed) && displayedValue !== "" ? parsed : value;
    commit(String(baseValue + delta));
  }

  return (
    <div className={className}>
      <span id={labelId} className="text-xs font-semibold text-white">Cantidad</span>
      <div className="mt-1.5 grid min-h-11 grid-cols-[2.75rem_1fr_2.75rem] overflow-hidden rounded-lg border border-silver/25 bg-onyx focus-within:border-emerald">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled || value <= min}
          aria-label="Disminuir cantidad"
          className="min-h-11 border-r border-silver/20 text-xl font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-silver/30"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          role="spinbutton"
          value={displayedValue}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            setDraft(digits);
            if (digits === "") return;
            const parsed = Number(digits);
            if (!Number.isFinite(parsed)) return;
            const nextValue = clamp(parsed, min, max);
            if (nextValue !== parsed) setDraft(String(nextValue));
            if (nextValue !== value) onChange(nextValue);
          }}
          onBlur={() => commit(displayedValue)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(displayedValue);
              event.currentTarget.blur();
            }
          }}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="min-w-0 bg-transparent px-2 text-center text-sm font-semibold text-white outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled || value >= max}
          aria-label="Aumentar cantidad"
          className="min-h-11 border-l border-silver/20 text-xl font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-silver/30"
        >
          +
        </button>
      </div>
    </div>
  );
}

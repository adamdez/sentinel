"use client";

import { useState, useCallback, useRef, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { sentinelInput } from "@/lib/sentinel-ui";

interface NumericInputProps {
  value: string;
  onChange: (raw: string) => void;
  prefix?: string;
  suffix?: string;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  allowDecimals?: boolean;
  className?: string;
}

function stripFormatting(s: string): string {
  return s.replace(/,/g, "");
}

function addCommas(s: string): string {
  const parts = s.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

export function NumericInput({
  value,
  onChange,
  prefix,
  suffix,
  label,
  min,
  max,
  allowDecimals = true,
  className,
}: NumericInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const displayValue = focused ? value : addCommas(value);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      let raw = stripFormatting(e.target.value);

      if (allowDecimals) {
        raw = raw.replace(/[^\d.]/g, "");
        const dotIdx = raw.indexOf(".");
        if (dotIdx !== -1) {
          raw = raw.slice(0, dotIdx + 1) + raw.slice(dotIdx + 1).replace(/\./g, "");
        }
      } else {
        raw = raw.replace(/\D/g, "");
      }

      if (max != null && raw !== "" && Number(raw) > max) return;

      onChange(raw);
    },
    [onChange, allowDecimals, max],
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (value === "" || value === ".") return;
    let n = parseFloat(value);
    if (isNaN(n)) { onChange(""); return; }
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    onChange(String(n));
  }, [value, onChange, min, max]);

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          className={cn(
            "w-full px-3 py-2",
            sentinelInput,
            prefix && "pl-7",
            suffix && "pr-10",
            className,
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

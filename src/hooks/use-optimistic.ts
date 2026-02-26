"use client";

import { useState, useCallback } from "react";

export function useOptimistic<T>(
  initialValue: T,
  updateFn: (current: T, optimistic: T) => T = (_, o) => o
) {
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);

  const setOptimistic = useCallback(
    async (optimisticValue: T, serverAction: () => Promise<T>) => {
      const previous = value;
      setValue(updateFn(value, optimisticValue));
      setPending(true);

      try {
        const result = await serverAction();
        setValue(result);
      } catch {
        setValue(previous);
      } finally {
        setPending(false);
      }
    },
    [value, updateFn]
  );

  return [value, setOptimistic, pending] as const;
}

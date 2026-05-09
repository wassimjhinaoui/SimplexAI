"use client";

import { useCallback, useState } from "react";
import { solveProblem } from "@/lib/simplex/integer";
import type { LPProblem, LPResult } from "@/lib/simplex/types";

export function useSolver() {
  const [result, setResult] = useState<LPResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const solve = useCallback((problem: LPProblem) => {
    setIsSolving(true);
    setError(null);
    try {
      const nextResult = solveProblem(problem);
      setResult(nextResult);
      return nextResult;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Erreur inconnue";
      setError(message);
      setResult(null);
      return null;
    } finally {
      setIsSolving(false);
    }
  }, []);

  return { result, isSolving, error, solve, setResult };
}

"use client";

import { useCallback, useState } from "react";
import type { LPProblem, LPResult } from "@/lib/simplex/types";

export type AIAnalysisSource = "provider" | "fallback" | "unknown";

export function useAIAnalysis() {
  const [analysis, setAnalysis] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<AIAnalysisSource>("unknown");
  const [providerLabel, setProviderLabel] = useState<string | null>(null);

  const analyze = useCallback(async (problem: LPProblem, result: LPResult) => {
    setAnalysis("");
    setIsStreaming(true);
    setError(null);
    setSource("unknown");
    setProviderLabel(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, result }),
      });
      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }
      const responseSource = response.headers.get("x-ai-source");
      setSource(responseSource === "provider" || responseSource === "fallback" ? responseSource : "unknown");
      setProviderLabel(response.headers.get("x-ai-provider"));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnalysis((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Analyse IA indisponible";
      setError(message);
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { analysis, isStreaming, error, source, providerLabel, analyze, setAnalysis };
}

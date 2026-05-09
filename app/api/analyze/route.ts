import type { LPProblem, LPResult } from "@/lib/simplex/types";
import { formatNum } from "@/lib/utils";

interface AnalyzeBody {
  problem: LPProblem;
  result: LPResult;
}

interface ChatDelta {
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
}

interface AnthropicDelta {
  type?: string;
  delta?: { text?: string };
  content_block?: { text?: string };
}

export async function POST(request: Request) {
  const body = (await request.json()) as AnalyzeBody;
  const apiKey = process.env.AI_API_KEY;
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const model = process.env.AI_MODEL ?? "gpt-4o";
  const baseUrl = getBaseUrl(provider);
  const prompt = buildPrompt(body.problem, body.result);

  if (!apiKey) {
    return streamText(localFallback(body.problem, body.result), {
      source: "fallback",
      provider: `${provider}/${model}`,
      reason: "missing-api-key",
    });
  }

  if (provider === "anthropic") {
    return streamAnthropic(baseUrl, apiKey, model, prompt, body);
  }

  return streamOpenAICompatible(baseUrl, apiKey, model, prompt, body);
}

export function GET() {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const model = process.env.AI_MODEL ?? "gpt-4o";
  return Response.json({
    provider,
    model,
    baseUrl: getBaseUrl(provider),
    hasApiKey: Boolean(process.env.AI_API_KEY),
  });
}

async function streamOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  fallbackBody: AnalyzeBody,
) {
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant expert en recherche opérationnelle. Réponds en français, de manière concise, structurée et pédagogique.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return streamText(localFallback(fallbackBody.problem, fallbackBody.result), {
      source: "fallback",
      provider: `openai-compatible/${model}`,
      reason: `provider-http-${upstream.status}`,
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as ChatDelta;
            const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
            if (content) controller.enqueue(encoder.encode(content));
          } catch {
            continue;
          }
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-AI-Source": "provider",
      "X-AI-Provider": `openai-compatible/${model}`,
    },
  });
}

async function streamAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  fallbackBody: AnalyzeBody,
) {
  const upstream = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      stream: true,
      system:
        "Tu es un assistant expert en recherche opérationnelle. Réponds en français, de manière concise, structurée et pédagogique.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return streamText(localFallback(fallbackBody.problem, fallbackBody.result), {
      source: "fallback",
      provider: `anthropic/${model}`,
      reason: `provider-http-${upstream.status}`,
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(5).trim()) as AnthropicDelta;
            const content = parsed.delta?.text ?? parsed.content_block?.text ?? "";
            if (content) controller.enqueue(encoder.encode(content));
          } catch {
            continue;
          }
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-AI-Source": "provider",
      "X-AI-Provider": `anthropic/${model}`,
    },
  });
}

function getBaseUrl(provider: string): string {
  const explicit = process.env.AI_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (provider === "anthropic") return "https://api.anthropic.com";
  if (provider === "groq") return "https://api.groq.com/openai/v1";
  if (provider === "mistral") return "https://api.mistral.ai/v1";
  return "https://api.openai.com/v1";
}

function streamText(
  text: string,
  metadata: { source: "provider" | "fallback"; provider: string; reason?: string } = {
    source: "fallback",
    provider: "local",
  },
) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-AI-Source": metadata.source,
        "X-AI-Provider": metadata.provider,
        ...(metadata.reason ? { "X-AI-Fallback-Reason": metadata.reason } : {}),
      },
    },
  );
}

function buildPrompt(problem: LPProblem, result: LPResult): string {
  const variables = problem.variables
    .map((variable, index) => `- ${variable.name}: ${variable.description}; entier=${variable.isInteger}; valeur=${formatNum(result.solution[index] ?? 0)}`)
    .join("\n");
  const constraints = problem.constraints
    .map((constraint) => `- ${constraint.label}: ${constraint.coefficients.join(", ")} ${constraint.sense} ${constraint.rhs}`)
    .join("\n");
  const shadows = result.sensitivity.shadowPrices
    .map((price) => `- ${price.label}: prix=${formatNum(price.value)}, active=${price.isBinding}`)
    .join("\n");
  const ranges = result.sensitivity.rhsRanges
    .map((range) => `- Contrainte ${range.constraintIndex + 1}: [${formatNum(range.lowerBound)}, ${formatNum(range.upperBound)}]`)
    .join("\n");

  return `Analyse ce problème de programmation linéaire.

Tu dois écrire exactement ces 4 sections, chacune avec son titre markdown:
## 1. Réalisme de la solution
## 2. Interprétation économique
## 3. Analyse de sensibilité
## 4. Recommandations

Contexte utilisateur:
${problem.context}

Objectif: ${problem.objective.direction.toUpperCase()} avec coefficients ${problem.objective.coefficients.join(", ")}
Valeur optimale: ${formatNum(result.objectiveValue)}

Variables:
${variables}

Contraintes:
${constraints}

Prix d'ombre:
${shadows}

Intervalles de stabilité RHS:
${ranges}

Variables supposées entières: ${problem.variables.filter((variable) => variable.isInteger).map((variable) => variable.name).join(", ") || "aucune"}.`;
}

function localFallback(problem: LPProblem, result: LPResult): string {
  const active = result.sensitivity.shadowPrices.filter((price) => price.isBinding);
  const violations = result.integerViolations.map((index) => problem.variables[index]?.name).filter(Boolean);
  return `## 1. Réalisme de la solution
La solution optimale donne Z* = ${formatNum(result.objectiveValue)}. ${violations.length ? `Attention: ${violations.join(", ")} devrait être entière mais ne l'est pas dans la relaxation linéaire.` : "Les contraintes d'intégralité signalées sont respectées par la relaxation."}

## 2. Interprétation économique
Les variables positives indiquent les activités à privilégier dans ce modèle. Les variables nulles ne contribuent pas à la solution optimale avec les coûts et ressources actuels.

## 3. Analyse de sensibilité
Les contraintes actives sont: ${active.map((price) => price.label).join(", ") || "aucune"}. Leurs prix d'ombre indiquent la variation marginale attendue de l'objectif lorsque le RHS augmente dans l'intervalle de stabilité.

## 4. Recommandations
Vérifier les unités, les hypothèses métier et les contraintes d'intégralité. Pour une décision industrielle réelle avec variables entières, compléter par une méthode Branch & Bound.`;
}

type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

export function formatNum(value: number): string {
  if (value === Infinity) return "+∞";
  if (value === -Infinity) return "-∞";
  if (Number.isNaN(value)) return "—";
  if (Math.abs(value) < 1e-9) return "0";
  const nearest = Math.round(value);
  if (Math.abs(value - nearest) < 1e-6) return String(nearest);
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function variableNameToLatex(name: string): string {
  const match = name.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return `\\text{${escapeLatex(name)}}`;
  return `\\text{${escapeLatex(match[1] ?? "")}}_{${match[2] ?? ""}}`;
}

export function linearTermToLatex(coefficient: number, variableName: string): string {
  return `${formatNum(coefficient)}\\cdot ${variableNameToLatex(variableName)}`;
}

export function linearExpressionToLatex(
  coefficients: number[],
  variableNames: string[],
  includeZeroTerms = false,
): string {
  const terms = coefficients.flatMap((coefficient, index) => {
    if (!includeZeroTerms && Math.abs(coefficient) < 1e-9) return [];
    const variableName = variableNames[index] ?? `x${index + 1}`;
    return [linearTermToLatex(coefficient, variableName)];
  });
  return terms.length ? terms.join(" + ").replace(/\+ -/g, "- ") : "0";
}

export function variableNameParts(name: string): { base: string; subscript?: string } {
  const match = name.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return { base: name };
  return { base: match[1] ?? name, subscript: match[2] };
}

function escapeLatex(value: string): string {
  return value.replace(/([_#$%&{}])/g, "\\$1");
}

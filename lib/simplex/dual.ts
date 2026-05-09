import type { Constraint, LPProblem, Variable } from "./types";

export function deriveDual(problem: LPProblem): LPProblem {
  const dualDirection = problem.objective.direction === "max" ? "min" : "max";
  const dualVariables: Variable[] = problem.constraints.map((constraint, index) => ({
    id: `y${index + 1}`,
    name: `y${index + 1}`,
    description: `variable duale associée à ${constraint.label || `c${index + 1}`}`,
    isInteger: false,
    isNonNegative: constraint.sense !== "=",
  }));

  const constraints: Constraint[] = problem.variables.map((variable, variableIndex) => {
    const coefficients = problem.constraints.map(
      (constraint) => constraint.coefficients[variableIndex] ?? 0,
    );
    const sense = dualDirection === "min" ? ">=" : "<=";
    return {
      id: `d${variableIndex + 1}`,
      coefficients,
      sense: variable.isNonNegative ? sense : "=",
      rhs: problem.objective.coefficients[variableIndex] ?? 0,
      label: `Dual de ${variable.name}`,
    };
  });

  return {
    variables: dualVariables,
    constraints,
    objective: {
      coefficients: problem.constraints.map((constraint) => constraint.rhs),
      direction: dualDirection,
    },
    context: `Dual automatiquement dérivé du problème primal. ${problem.context}`,
  };
}

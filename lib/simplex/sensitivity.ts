import type { LPProblem, SensitivityResult, SimplexMetadata, TableauStep } from "./types";

const EPS = 1e-9;

export function calculateSensitivity(
  problem: LPProblem,
  finalStep: TableauStep | undefined,
  metadata: SimplexMetadata,
): SensitivityResult {
  if (!finalStep) {
    return { shadowPrices: [], rhsRanges: [], objectiveRanges: [] };
  }

  const objectiveRow = finalStep.tableau[finalStep.tableau.length - 1] ?? [];
  const rhsIndex = finalStep.colNames.length;
  const shadowPrices = problem.constraints.map((constraint, index) => {
    const column = metadata.rhsColumns[index] ?? metadata.slackColumns[index] ?? -1;
    const sign = metadata.rhsSigns[index] ?? 1;
    const value = column >= 0 ? sign * (objectiveRow[column] ?? 0) : 0;
    const activity = constraint.coefficients.reduce(
      (sum, coefficient, variableIndex) =>
        sum + coefficient * getDecisionValue(finalStep, variableIndex, rhsIndex),
      0,
    );
    return {
      constraintIndex: index,
      label: constraint.label || `Contrainte ${index + 1}`,
      value,
      isBinding: Math.abs(activity - constraint.rhs) < 1e-6,
    };
  });

  const rhsRanges = problem.constraints.map((constraint, index) => {
    const column = metadata.rhsColumns[index] ?? -1;
    const sign = metadata.rhsSigns[index] ?? 1;
    let lowerDelta = -Infinity;
    let upperDelta = Infinity;

    if (column >= 0) {
      for (let row = 0; row < finalStep.tableau.length - 1; row += 1) {
        const current = finalStep.tableau[row][rhsIndex] ?? 0;
        const direction = sign * (finalStep.tableau[row][column] ?? 0);
        if (Math.abs(direction) < EPS) continue;
        const bound = -current / direction;
        if (direction > 0) {
          lowerDelta = Math.max(lowerDelta, bound);
        } else {
          upperDelta = Math.min(upperDelta, bound);
        }
      }
    }

    return {
      constraintIndex: index,
      currentRHS: constraint.rhs,
      lowerBound: constraint.rhs + lowerDelta,
      upperBound: constraint.rhs + upperDelta,
      shadowPrice: shadowPrices[index]?.value ?? 0,
    };
  });

  const objectiveRanges = problem.variables.map((variable, variableIndex) => {
    const currentCoefficient = problem.objective.coefficients[variableIndex] ?? 0;
    const isBasic = finalStep.basis.includes(variableIndex);
    if (!isBasic) {
      const reducedCost = objectiveRow[variableIndex] ?? 0;
      return {
        variableIndex,
        variableName: variable.name,
        currentCoefficient,
        lowerBound: problem.objective.direction === "max" ? currentCoefficient - reducedCost : -Infinity,
        upperBound: problem.objective.direction === "max" ? Infinity : currentCoefficient + reducedCost,
      };
    }

    let decrease = Infinity;
    let increase = Infinity;
    const basisRow = finalStep.basis.indexOf(variableIndex);
    for (let col = 0; col < finalStep.colNames.length; col += 1) {
      if (finalStep.basis.includes(col)) continue;
      const coefficient = finalStep.tableau[basisRow]?.[col] ?? 0;
      const reducedCost = objectiveRow[col] ?? 0;
      if (coefficient > EPS) decrease = Math.min(decrease, reducedCost / coefficient);
      if (coefficient < -EPS) increase = Math.min(increase, -reducedCost / coefficient);
    }

    return {
      variableIndex,
      variableName: variable.name,
      currentCoefficient,
      lowerBound: currentCoefficient - decrease,
      upperBound: currentCoefficient + increase,
    };
  });

  return { shadowPrices, rhsRanges, objectiveRanges };
}

function getDecisionValue(step: TableauStep, variableIndex: number, rhsIndex: number): number {
  const row = step.basis.indexOf(variableIndex);
  return row >= 0 ? step.tableau[row]?.[rhsIndex] ?? 0 : 0;
}

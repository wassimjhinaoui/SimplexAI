import { deriveDual } from "./dual";
import { calculateSensitivity } from "./sensitivity";
import type { Constraint, LPProblem, LPResult, SimplexMetadata, TableauStep } from "./types";

const EPS = 1e-9;
const BIG_M = 1_000_000;
const MAX_ITERATIONS = 100;

interface StandardForm {
  rows: number[][];
  rhs: number[];
  colNames: string[];
  basis: number[];
  costs: number[];
  metadata: SimplexMetadata;
}

export function solveLP(problem: LPProblem): LPResult {
  const standard = toStandardForm(problem);
  const width = standard.colNames.length + 1;
  const tableau = standard.rows.map((row, rowIndex) => [...row, standard.rhs[rowIndex] ?? 0]);
  const objectiveRow = [...standard.costs.map((cost) => -cost), 0];

  standard.basis.forEach((basicColumn, rowIndex) => {
    const basicCost = standard.costs[basicColumn] ?? 0;
    if (Math.abs(basicCost) < EPS) return;
    for (let col = 0; col < width; col += 1) {
      objectiveRow[col] += basicCost * (tableau[rowIndex]?.[col] ?? 0);
    }
  });
  tableau.push(objectiveRow);

  const steps: TableauStep[] = [
    snapshot(tableau, standard.basis, standard.colNames, {
      iteration: 0,
      explanation: "Tableau initial après conversion en forme standard et pénalisation Big-M.",
    }),
  ];

  let status: LPResult["status"] = "optimal";
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const pivotCol = chooseEnteringColumn(tableau);
    if (pivotCol === undefined) break;
    const pivotRow = chooseLeavingRow(tableau, pivotCol);
    if (pivotRow === undefined) {
      status = "unbounded";
      steps.push(
        snapshot(tableau, standard.basis, standard.colNames, {
          iteration,
          pivotCol,
          enteringVariable: standard.colNames[pivotCol],
          explanation: `La variable ${standard.colNames[pivotCol]} peut entrer, mais aucun ratio positif n'existe: le problème est non borné.`,
        }),
      );
      break;
    }

    const leavingColumn = standard.basis[pivotRow] ?? -1;
    pivot(tableau, pivotRow, pivotCol);
    standard.basis[pivotRow] = pivotCol;
    steps.push(
      snapshot(tableau, standard.basis, standard.colNames, {
        iteration,
        pivotRow,
        pivotCol,
        enteringVariable: standard.colNames[pivotCol],
        leavingVariable: standard.colNames[leavingColumn] ?? "—",
        explanation: `${standard.colNames[pivotCol]} entre dans la base et ${standard.colNames[leavingColumn] ?? "une variable"} sort après le test du ratio minimum.`,
      }),
    );
  }

  const finalStep = steps[steps.length - 1];
  const rhsIndex = standard.colNames.length;
  const solution = problem.variables.map((_, variableIndex) => {
    const row = standard.basis.indexOf(variableIndex);
    return clean(row >= 0 ? tableau[row]?.[rhsIndex] ?? 0 : 0);
  });

  if (
    status === "optimal" &&
    standard.metadata.artificialColumns.some((column) => {
      const row = standard.basis.indexOf(column);
      return row >= 0 && (tableau[row]?.[rhsIndex] ?? 0) > 1e-7;
    })
  ) {
    status = "infeasible";
  }

  const maxObjectiveValue = tableau[tableau.length - 1]?.[rhsIndex] ?? 0;
  const objectiveValue = clean(problem.objective.direction === "max" ? maxObjectiveValue : -maxObjectiveValue);
  const sensitivity = status === "optimal" ? calculateSensitivity(problem, finalStep, standard.metadata) : { shadowPrices: [], rhsRanges: [], objectiveRanges: [] };
  const integerViolations = solution.flatMap((value, index) =>
    problem.variables[index]?.isInteger && Math.abs(value - Math.round(value)) > 1e-6 ? [index] : [],
  );
  const dualSolution = getDualSolution(problem, sensitivity.shadowPrices);

  return {
    status,
    solution,
    objectiveValue,
    iterations: steps,
    sensitivity,
    dualSolution,
    integerViolations,
  };
}

function toStandardForm(problem: LPProblem): StandardForm {
  const normalized = problem.constraints.map(normalizeConstraint);
  const colNames = problem.variables.map((variable) => variable.name || variable.id);
  const rows = normalized.map((constraint) =>
    Array.from({ length: problem.variables.length }, (_, index) => constraint.coefficients[index] ?? 0),
  );
  const rhs = normalized.map((constraint) => constraint.rhs);
  const basis: number[] = [];
  const artificialColumns: number[] = [];
  const slackColumns: number[] = [];
  const rhsColumns: number[] = [];
  const rhsSigns: number[] = [];
  const baseCosts = problem.objective.coefficients.map((coefficient) =>
    problem.objective.direction === "max" ? coefficient : -coefficient,
  );

  normalized.forEach((constraint, rowIndex) => {
    if (constraint.sense === "<=") {
      const col = appendColumn(rows, rowIndex, 1);
      colNames.push(`s${rowIndex + 1}`);
      baseCosts.push(0);
      basis[rowIndex] = col;
      slackColumns[rowIndex] = col;
      rhsColumns[rowIndex] = col;
      rhsSigns[rowIndex] = 1;
      return;
    }

    if (constraint.sense === ">=") {
      const surplusCol = appendColumn(rows, rowIndex, -1);
      colNames.push(`e${rowIndex + 1}`);
      baseCosts.push(0);
      slackColumns[rowIndex] = surplusCol;
      rhsColumns[rowIndex] = surplusCol;
      rhsSigns[rowIndex] = -1;
    }

    const artificialCol = appendColumn(rows, rowIndex, 1);
    colNames.push(`a${rowIndex + 1}`);
    baseCosts.push(-BIG_M);
    basis[rowIndex] = artificialCol;
    artificialColumns.push(artificialCol);
    if (constraint.sense === "=") {
      rhsColumns[rowIndex] = artificialCol;
      rhsSigns[rowIndex] = 1;
    }
  });

  return {
    rows,
    rhs,
    colNames,
    basis,
    costs: baseCosts,
    metadata: {
      slackColumns,
      rhsColumns,
      rhsSigns,
      artificialColumns,
      originalVariableCount: problem.variables.length,
    },
  };
}

function normalizeConstraint(constraint: Constraint): Constraint {
  if (constraint.rhs >= 0) return constraint;
  const sense = constraint.sense === "<=" ? ">=" : constraint.sense === ">=" ? "<=" : "=";
  return {
    ...constraint,
    coefficients: constraint.coefficients.map((coefficient) => -coefficient),
    sense,
    rhs: -constraint.rhs,
  };
}

function appendColumn(rows: number[][], activeRow: number, value: number): number {
  const col = rows[0]?.length ?? 0;
  rows.forEach((row, rowIndex) => row.push(rowIndex === activeRow ? value : 0));
  return col;
}

function chooseEnteringColumn(tableau: number[][]): number | undefined {
  const objectiveRow = tableau[tableau.length - 1] ?? [];
  let minValue = -EPS;
  let pivotCol: number | undefined;
  for (let col = 0; col < objectiveRow.length - 1; col += 1) {
    if ((objectiveRow[col] ?? 0) < minValue) {
      minValue = objectiveRow[col] ?? 0;
      pivotCol = col;
    }
  }
  return pivotCol;
}

function chooseLeavingRow(tableau: number[][], pivotCol: number): number | undefined {
  const rhsIndex = (tableau[0]?.length ?? 1) - 1;
  let bestRatio = Infinity;
  let rowChoice: number | undefined;
  for (let row = 0; row < tableau.length - 1; row += 1) {
    const entry = tableau[row]?.[pivotCol] ?? 0;
    if (entry <= EPS) continue;
    const ratio = (tableau[row]?.[rhsIndex] ?? 0) / entry;
    if (ratio < bestRatio - EPS) {
      bestRatio = ratio;
      rowChoice = row;
    }
  }
  return rowChoice;
}

function pivot(tableau: number[][], pivotRow: number, pivotCol: number): void {
  const pivotValue = tableau[pivotRow]?.[pivotCol] ?? 1;
  for (let col = 0; col < (tableau[pivotRow]?.length ?? 0); col += 1) {
    tableau[pivotRow][col] = (tableau[pivotRow][col] ?? 0) / pivotValue;
  }
  for (let row = 0; row < tableau.length; row += 1) {
    if (row === pivotRow) continue;
    const factor = tableau[row]?.[pivotCol] ?? 0;
    if (Math.abs(factor) < EPS) continue;
    for (let col = 0; col < (tableau[row]?.length ?? 0); col += 1) {
      tableau[row][col] = (tableau[row][col] ?? 0) - factor * (tableau[pivotRow]?.[col] ?? 0);
    }
  }
}

function snapshot(
  tableau: number[][],
  basis: number[],
  colNames: string[],
  details: Omit<TableauStep, "tableau" | "basis" | "colNames" | "reducedCosts">,
): TableauStep {
  const objectiveRow = tableau[tableau.length - 1] ?? [];
  return {
    ...details,
    tableau: tableau.map((row) => row.map(clean)),
    basis: [...basis],
    colNames: [...colNames],
    reducedCosts: objectiveRow.slice(0, -1).map(clean),
  };
}

function clean(value: number): number {
  return Math.abs(value) < EPS ? 0 : value;
}

function getDualSolution(
  problem: LPProblem,
  shadowPrices: { value: number }[],
): number[] {
  const dual = deriveDual(problem);
  return dual.variables.map((_, index) => clean(shadowPrices[index]?.value ?? 0));
}

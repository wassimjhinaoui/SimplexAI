import { solveLP } from "./solver";
import type { BranchAndBoundNode, BranchAndBoundSummary, Constraint, LPProblem, LPResult } from "./types";

const EPS = 1e-6;
const MAX_NODES = 250;

interface SearchNode {
  id: number;
  depth: number;
  problem: LPProblem;
  branchConstraint?: string;
}

export function solveProblem(problem: LPProblem): LPResult {
  const integerIndexes = problem.variables
    .map((variable, index) => (variable.isInteger ? index : -1))
    .filter((index) => index >= 0);

  if (integerIndexes.length === 0) {
    const continuous = solveLP(problem);
    return {
      ...continuous,
      isIntegerSolution: true,
      branchAndBound: {
        enabled: false,
        nodesExplored: 1,
        integerVariableNames: [],
        nodes: [],
        message: "Aucune variable entière: résolution continue par simplexe.",
      },
    };
  }

  return solveInteger(problem, integerIndexes);
}

function solveInteger(problem: LPProblem, integerIndexes: number[]): LPResult {
  const nodes: SearchNode[] = [{ id: 1, depth: 0, problem }];
  const explored: BranchAndBoundNode[] = [];
  let nextId = 2;
  let incumbent: LPResult | null = null;
  let incumbentProblem: LPProblem | null = null;

  while (nodes.length > 0 && explored.length < MAX_NODES) {
    const node = nodes.shift();
    if (!node) break;

    const relaxation = solveLP(node.problem);
    const nodeInfo: BranchAndBoundNode = {
      id: node.id,
      depth: node.depth,
      status: relaxation.status,
      objectiveValue: relaxation.status === "optimal" ? relaxation.objectiveValue : undefined,
      branchConstraint: node.branchConstraint,
    };

    if (relaxation.status !== "optimal") {
      explored.push(nodeInfo);
      continue;
    }

    if (incumbent && !canImprove(problem, relaxation.objectiveValue, incumbent.objectiveValue)) {
      explored.push({ ...nodeInfo, status: "pruned" });
      continue;
    }

    const fractionalIndex = integerIndexes.find((index) => !isInteger(relaxation.solution[index] ?? 0));
    if (fractionalIndex === undefined) {
      explored.push({ ...nodeInfo, status: "integer" });
      if (!incumbent || isBetter(problem, relaxation.objectiveValue, incumbent.objectiveValue)) {
        incumbent = {
          ...relaxation,
          solution: relaxation.solution.map((value, index) =>
            integerIndexes.includes(index) ? Math.round(value) : value,
          ),
          integerViolations: [],
          isIntegerSolution: true,
        };
        incumbentProblem = node.problem;
      }
      continue;
    }

    const value = relaxation.solution[fractionalIndex] ?? 0;
    const variableName = problem.variables[fractionalIndex]?.name ?? `x${fractionalIndex + 1}`;
    const floorValue = Math.floor(value);
    const ceilValue = Math.ceil(value);
    explored.push({ ...nodeInfo, branchedVariable: variableName });

    nodes.unshift(
      {
        id: nextId,
        depth: node.depth + 1,
        problem: withBranchConstraint(node.problem, fractionalIndex, ">=", ceilValue),
        branchConstraint: `${variableName} >= ${ceilValue}`,
      },
      {
        id: nextId + 1,
        depth: node.depth + 1,
        problem: withBranchConstraint(node.problem, fractionalIndex, "<=", floorValue),
        branchConstraint: `${variableName} <= ${floorValue}`,
      },
    );
    nextId += 2;
  }

  const summary: BranchAndBoundSummary = {
    enabled: true,
    nodesExplored: explored.length,
    integerVariableNames: integerIndexes.map((index) => problem.variables[index]?.name ?? `x${index + 1}`),
    nodes: explored,
    message:
      explored.length >= MAX_NODES
        ? `Recherche interrompue après ${MAX_NODES} noeuds.`
        : "Variables entières résolues par Branch & Bound.",
  };

  if (!incumbent || !incumbentProblem) {
    const root = solveLP(problem);
    const status = root.status === "unbounded" ? "unbounded" : "infeasible";
    return {
      ...root,
      status,
      solution: status === "unbounded" ? root.solution : problem.variables.map(() => 0),
      objectiveValue: status === "unbounded" ? root.objectiveValue : 0,
      integerViolations: [],
      isIntegerSolution: false,
      branchAndBound: {
        ...summary,
        message:
          status === "unbounded"
            ? "Relaxation non bornée: le problème entier est traité comme non borné."
            : "Aucune solution entière réalisable trouvée par Branch & Bound.",
      },
    };
  }

  const finalSensitivity = solveLP(incumbentProblem);
  return {
    ...incumbent,
    iterations: finalSensitivity.iterations,
    sensitivity: finalSensitivity.sensitivity,
    dualSolution: finalSensitivity.dualSolution,
    branchAndBound: summary,
  };
}

function withBranchConstraint(
  problem: LPProblem,
  variableIndex: number,
  sense: Constraint["sense"],
  rhs: number,
): LPProblem {
  const coefficients = problem.variables.map((_, index) => (index === variableIndex ? 1 : 0));
  const variableName = problem.variables[variableIndex]?.name ?? `x${variableIndex + 1}`;
  return {
    ...problem,
    constraints: [
      ...problem.constraints,
      {
        id: `bb-${variableName}-${sense}-${rhs}-${problem.constraints.length}`,
        coefficients,
        sense,
        rhs,
        label: `Branch & Bound: ${variableName} ${sense} ${rhs}`,
      },
    ],
  };
}

function isInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) < EPS;
}

function isBetter(problem: LPProblem, candidate: number, incumbent: number): boolean {
  return problem.objective.direction === "max" ? candidate > incumbent + EPS : candidate < incumbent - EPS;
}

function canImprove(problem: LPProblem, bound: number, incumbent: number): boolean {
  return problem.objective.direction === "max" ? bound > incumbent + EPS : bound < incumbent - EPS;
}

export interface Variable {
  id: string;
  name: string;
  description: string;
  isInteger: boolean;
  isNonNegative: boolean;
}

export interface Constraint {
  id: string;
  coefficients: number[];
  sense: "<=" | ">=" | "=";
  rhs: number;
  label: string;
}

export interface LPProblem {
  variables: Variable[];
  constraints: Constraint[];
  objective: {
    coefficients: number[];
    direction: "max" | "min";
  };
  context: string;
}

export interface TableauStep {
  iteration: number;
  tableau: number[][];
  basis: number[];
  colNames: string[];
  pivotRow?: number;
  pivotCol?: number;
  enteringVariable?: string;
  leavingVariable?: string;
  reducedCosts: number[];
  explanation: string;
}

export interface ShadowPrice {
  constraintIndex: number;
  label: string;
  value: number;
  isBinding: boolean;
}

export interface RHSRange {
  constraintIndex: number;
  currentRHS: number;
  lowerBound: number;
  upperBound: number;
  shadowPrice: number;
}

export interface ObjectiveRange {
  variableIndex: number;
  variableName: string;
  currentCoefficient: number;
  lowerBound: number;
  upperBound: number;
}

export interface SensitivityResult {
  shadowPrices: ShadowPrice[];
  rhsRanges: RHSRange[];
  objectiveRanges: ObjectiveRange[];
}

export interface LPResult {
  status: "optimal" | "infeasible" | "unbounded";
  solution: number[];
  objectiveValue: number;
  iterations: TableauStep[];
  sensitivity: SensitivityResult;
  dualSolution: number[];
  integerViolations: number[];
  isIntegerSolution?: boolean;
  branchAndBound?: BranchAndBoundSummary;
}

export interface SimplexMetadata {
  slackColumns: number[];
  rhsColumns: number[];
  rhsSigns: number[];
  artificialColumns: number[];
  originalVariableCount: number;
}

export interface BranchAndBoundNode {
  id: number;
  depth: number;
  status: "optimal" | "infeasible" | "unbounded" | "pruned" | "integer";
  objectiveValue?: number;
  branchedVariable?: string;
  branchConstraint?: string;
}

export interface BranchAndBoundSummary {
  enabled: boolean;
  nodesExplored: number;
  integerVariableNames: string[];
  nodes: BranchAndBoundNode[];
  message: string;
}

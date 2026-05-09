import type { LPProblem } from "@/lib/simplex/types";

export interface ExampleProblem {
  name: string;
  problem: LPProblem;
}

function variable(id: string, name: string, description: string, isInteger = false) {
  return { id, name, description, isInteger, isNonNegative: true };
}

export const examples: ExampleProblem[] = [
  {
    name: "Soldats et Trains",
    problem: {
      variables: [
        variable("x1", "x1", "nombre de soldats produits", true),
        variable("x2", "x2", "nombre de trains produits", true),
      ],
      objective: { coefficients: [3, 2], direction: "max" },
      constraints: [
        { id: "c1", coefficients: [1, 1], sense: "<=", rhs: 80, label: "Menuiserie" },
        { id: "c2", coefficients: [2, 1], sense: "<=", rhs: 100, label: "Finition" },
        { id: "c3", coefficients: [1, 0], sense: "<=", rhs: 40, label: "Demande soldats" },
      ],
      context: "Fabrication hebdomadaire de jouets. Les coefficients de l'objectif représentent le profit unitaire.",
    },
  },
  {
    name: "MEUBLE — Bureaux, Tables, Chaises",
    problem: {
      variables: [
        variable("x1", "x1", "bureaux"),
        variable("x2", "x2", "tables"),
        variable("x3", "x3", "chaises"),
      ],
      objective: { coefficients: [60, 30, 20], direction: "max" },
      constraints: [
        { id: "c1", coefficients: [8, 6, 1], sense: "<=", rhs: 48, label: "Bois" },
        { id: "c2", coefficients: [2, 1.5, 0.5], sense: "<=", rhs: 8, label: "Menuiserie" },
        { id: "c3", coefficients: [4, 2, 1.5], sense: "<=", rhs: 20, label: "Finition" },
      ],
      context: "Production de meubles avec ressources limitées en bois, menuiserie et finition.",
    },
  },
  {
    name: "Régime Alimentaire",
    problem: {
      variables: Array.from({ length: 6 }, (_, i) =>
        variable(`x${i + 1}`, `x${i + 1}`, `kg de l'aliment ${i + 1}`),
      ),
      objective: { coefficients: [35, 30, 60, 50, 27, 22], direction: "min" },
      constraints: [
        { id: "c1", coefficients: [1, 2, 4, 1, 2, 0], sense: ">=", rhs: 9, label: "Vitamine A" },
        { id: "c2", coefficients: [3, 1, 0, 2, 1, 4], sense: ">=", rhs: 19, label: "Vitamine C" },
      ],
      context: "Minimiser le coût d'un régime alimentaire tout en couvrant les besoins nutritionnels.",
    },
  },
  {
    name: "Problème Non Borné",
    problem: {
      variables: [variable("x1", "x1", "activité 1"), variable("x2", "x2", "activité 2")],
      objective: { coefficients: [1, 2], direction: "max" },
      constraints: [
        { id: "c1", coefficients: [7, 2], sense: ">=", rhs: 28, label: "Seuil A" },
        { id: "c2", coefficients: [1, 6], sense: ">=", rhs: 12, label: "Seuil B" },
      ],
      context: "Exemple pédagogique où la région réalisable ne limite pas l'objectif vers le haut.",
    },
  },
  {
    name: "Solutions Infinies",
    problem: {
      variables: [variable("x1", "x1", "produit 1"), variable("x2", "x2", "produit 2")],
      objective: { coefficients: [3, 2], direction: "max" },
      constraints: [
        { id: "c1", coefficients: [3, 2], sense: "<=", rhs: 120, label: "Profit cible" },
        { id: "c2", coefficients: [1, 1], sense: "<=", rhs: 50, label: "Capacité" },
      ],
      context: "Exemple avec une contrainte parallèle à l'objectif, pouvant produire plusieurs optima.",
    },
  },
];

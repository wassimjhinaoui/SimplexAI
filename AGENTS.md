# SimplexAI — Agent Instructions

You are building a professional, production-ready web application called **SimplexAI**: a Linear Programming solver with step-by-step Simplex visualization and AI-powered solution analysis.

This is a college project in Operations Research (Recherche Opérationnelle). The UI language is **French**. The codebase language is **English**.

---

## Tech Stack

- **Styling**: Tailwind CSS + shadcn/ui components
- **Animations**: Framer Motion
- **Math rendering**: KaTeX
- **Charts**: Recharts
- **AI integration**: Any LLM provider via a server-side API route (provider-agnostic, use environment variable `AI_API_KEY`)
- **PDF export**: jsPDF or react-pdf
- **Storage**: localStorage for problem history

---

## Project Structure

```
simplex-ai/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Landing page
│   ├── solver/
│   │   └── page.tsx                # Main solver interface
│   └── api/
│       └── analyze/
│           └── route.ts            # Streaming AI analysis endpoint
├── components/
│   ├── solver/
│   │   ├── ProblemInput.tsx        # Variable + constraint builder
│   │   ├── ObjectiveBuilder.tsx    # Objective function editor
│   │   ├── SolutionDisplay.tsx     # KPI cards, optimal values
│   │   ├── TableauViewer.tsx       # Step-by-step tableau
│   │   ├── SensitivityPanel.tsx    # Shadow prices, RHS ranges
│   │   ├── DualPanel.tsx           # Auto-derived dual problem
│   │   ├── GraphPanel.tsx          # 2D feasible region (2-var only)
│   │   └── AIAnalysis.tsx          # Streaming AI response
│   └── ui/                         # shadcn components
├── lib/
│   simplex/
│   │   ├── solver.ts               # Core simplex engine (pure functions)
│   │   ├── sensitivity.ts          # Sensitivity analysis logic
│   │   ├── dual.ts                 # Dual problem construction
│   │   └── types.ts                # All TypeScript interfaces
│   └── utils.ts
├── hooks/
│   ├── useSolver.ts
│   └── useAIAnalysis.ts
└── .env.local
```

---

## TypeScript Interfaces

Define all types in `lib/simplex/types.ts`. No `any` types anywhere.

```typescript
interface Variable {
  id: string;
  name: string; // e.g. "x1"
  description: string; // e.g. "nombre de soldats produits"
  isInteger: boolean; // used by AI reality-check
  isNonNegative: boolean;
}

interface Constraint {
  id: string;
  coefficients: number[];
  sense: "<=" | ">=" | "=";
  rhs: number;
  label: string; // e.g. "Capacité menuiserie"
}

interface LPProblem {
  variables: Variable[];
  constraints: Constraint[];
  objective: {
    coefficients: number[];
    direction: "max" | "min";
  };
  context: string; // free-text for AI prompt
}

interface TableauStep {
  iteration: number;
  tableau: number[][];
  basis: number[];
  colNames: string[];
  pivotRow?: number;
  pivotCol?: number;
  enteringVariable?: string;
  leavingVariable?: string;
  reducedCosts: number[];
  explanation: string; // plain French explanation of this step
}

interface ShadowPrice {
  constraintIndex: number;
  label: string;
  value: number;
  isBinding: boolean;
}

interface RHSRange {
  constraintIndex: number;
  currentRHS: number;
  lowerBound: number; // -Infinity allowed
  upperBound: number; // +Infinity allowed
  shadowPrice: number;
}

interface ObjectiveRange {
  variableIndex: number;
  variableName: string;
  currentCoefficient: number;
  lowerBound: number;
  upperBound: number;
}

interface SensitivityResult {
  shadowPrices: ShadowPrice[];
  rhsRanges: RHSRange[];
  objectiveRanges: ObjectiveRange[];
}

interface LPResult {
  status: "optimal" | "infeasible" | "unbounded";
  solution: number[];
  objectiveValue: number;
  iterations: TableauStep[];
  sensitivity: SensitivityResult;
  dualSolution: number[];
  integerViolations: number[]; // indices of variables that should be integer but aren't
}
```

---

## Simplex Engine (`lib/simplex/solver.ts`)

Implement a complete, self-contained Simplex solver. It must be a **pure function** with no side effects.

### Requirements

**Standard form conversion**

- Add slack variables for `<=` constraints
- Add surplus + artificial variables for `>=` constraints
- Add artificial variables for `=` constraints
- Use the **Big-M method** to penalize artificials in the objective
- If RHS is negative, multiply the entire row by -1 and flip the sense

**Pivot selection**

- Entering variable: most negative reduced cost in the objective row
- Leaving variable: minimum ratio test (`rhs / pivot_col_entry`, only for positive entries)

**Termination**

- Optimal: no negative reduced costs remain
- Unbounded: entering variable chosen but no positive entries in its column
- Infeasible: optimal but an artificial variable remains in basis with value > 0

**Step recording**

- Snapshot the full tableau, basis array, column names, pivot indices, and a French explanation string after every pivot

**Sensitivity analysis** (implement in `lib/simplex/sensitivity.ts`)

- Shadow prices: read from the objective row at slack variable columns in the final tableau
- RHS ranging: for each constraint i, compute how much b_i can increase/decrease while the current basis remains feasible
- Objective coefficient ranging: for basic variables, compute how much c_j can change while the current basis remains optimal

**Dual construction** (implement in `lib/simplex/dual.ts`)

- Given primal (P), automatically derive dual (D) using the standard rules:
  - Transpose constraint matrix
  - Swap objective vector and RHS vector
  - Flip objective direction
  - Map constraint types and variable sign constraints per duality table
- Return the dual as an `LPProblem` object so it can be displayed or solved

---

## API Route (`app/api/analyze/route.ts`)

**POST** endpoint. Accepts JSON body:

```typescript
{
  problem: LPProblem;
  result: LPResult;
}
```

Constructs a structured prompt in French and calls an LLM of your choice via streaming. Return a `ReadableStream` (use `Response` with a `TransformStream`).

The prompt must instruct the model to write a structured analysis with exactly these 4 sections, each starting with a markdown heading:

```
## 1. Réalisme de la solution
## 2. Interprétation économique
## 3. Analyse de sensibilité
## 4. Recommandations
```

Include in the prompt:

- The problem formulation (variables, constraints, objective)
- The context text written by the user
- The optimal solution values
- Which variables are supposed to be integers
- The shadow prices and their binding status
- The RHS stability intervals

**The AI provider and model are configurable via environment variables. Do not hardcode any provider.**

```env
AI_PROVIDER=openai          # or anthropic, groq, mistral, etc.
AI_MODEL=gpt-4o
AI_API_KEY=your_key_here
AI_BASE_URL=https://api.openai.com/v1   # optional, for custom endpoints
```

Use the OpenAI-compatible chat completions API format by default (most providers support it). Add a simple provider adapter if needed.

---

## UI Design

### Theme

Dark, technical, refined. Define these as Tailwind CSS variables:

```css
--bg: #0a0c10 --surface: #111318 --surface-2: #181c27 --surface-3: #1e2333
  --border: #1e2333 --border-2: #2a3050 --accent: #4f8ef7 /* electric blue */
  --accent-2: #7c5cbf /* violet */ --accent-3: #3ecf8e /* teal green */
  --text: #e8eaf0 --text-2: #8a90a8 --text-3: #4a5070 --green: #3ecf8e
  --red: #f87171 --amber: #f59e0b;
```

### Fonts

- Headings: `Fraunces` (Google Fonts) — serif, optical size aware
- Body + code + numbers: `DM Mono` (Google Fonts)

### Landing Page (`app/page.tsx`)

- Full-viewport hero with the app name, a one-sentence description, and a "Lancer le solveur →" CTA button
- Three feature cards below: Solveur Simplexe, Visualisation du Tableau, Analyse IA
- Minimal, no noise — let the dark background breathe

### Solver Page (`app/solver/page.tsx`)

Two-column layout on desktop (`lg:grid-cols-[1fr_1fr]`), single column on mobile.

**Left column — Problem builder**

1. **Variables section**: list of variable rows. Each row has: name input, description input, integer checkbox, non-negative checkbox, delete button. "Ajouter une variable" button at the bottom.

2. **Objective section**: Max/Min toggle (pill switcher, not a dropdown), then one coefficient input per variable, each labeled with the variable name.

3. **Constraints section**: list of constraint rows. Each row has: one coefficient input per variable, sense selector (`<=` / `>=` / `=`), RHS input, label input, delete button. "Ajouter une contrainte" button.

4. **Context section**: a `<textarea>` labeled "Contexte du problème (pour l'analyse IA)" where the user describes what the variables represent, business constraints, integer requirements, etc.

5. **Examples dropdown**: pre-load one of 5 example problems. See examples section below.

6. **"Résoudre & Analyser" button**: full-width, prominent, shows a spinner while solving.

**Right column — Results**

Only render this column after a solve has been attempted.

- **Status banner**: full-width colored banner. Green for optimal, red for infeasible, amber for unbounded. Includes an icon and a short French message.

- **Integer violation warning**: if any integer-flagged variable has a non-integer optimal value, show an amber warning card listing the violations and explaining they should use Branch & Bound or verify the model.

- **KPI cards**: one card per variable showing its optimal value. Highlight in amber if integer-violated.

- **Objective value**: large display of Z\* with the direction label.

- **Tabbed panel** with three tabs:
  - **Tableau**: step navigator (iteration pills + Previous/Next buttons), full tableau rendered as an HTML table. Color coding: pivot cell = blue highlight, negative reduced costs = green, positive reduced costs = red, current basis column headers = accent color. Below the table, show the plain-language explanation for that step.
  - **Sensibilité**: table of shadow prices (constraint label, RHS, shadow price, binding status, stability interval [lo, hi]). Below it, a Recharts horizontal bar chart of shadow prices — bars colored green for positive, red for negative.
  - **Dual**: display the automatically derived dual problem in mathematical notation using KaTeX. Show its variable values if solved.

**Full-width section below both columns — AI Analysis**

- Visible only after solving an optimal problem
- Shows a pulsing "Analyse en cours…" state while streaming
- Renders streaming markdown: section headings (`##`) styled as colored labels, bold text styled, normal paragraphs in body font
- Animated typing cursor at the end of the stream
- "Copier l'analyse" button (copies plain text to clipboard)

**2D Graph panel** (shown only when exactly 2 decision variables)

- Canvas or SVG rendering of:
  - Each constraint as a labeled line
  - The feasible region as a shaded polygon (intersection of all half-planes)
  - All corner points (vertices) of the feasible region as dots with coordinate labels
  - The isoprofit line for the optimal Z value
  - The optimal point highlighted with a larger dot and a label
- Axes labeled with variable names
- Interactive: hovering a corner point shows its coordinates and Z value in a tooltip

---

## Example Problems Library

Pre-load these 5 examples. Populate all fields including context when selected.

**1. Soldats et Trains** (from course notes)

- Variables: x1 (soldats, integer), x2 (trains, integer)
- Max: 3x1 + 2x2
- Constraints: x1 + x2 ≤ 80 (menuiserie), 2x1 + x2 ≤ 100 (finition), x1 ≤ 40 (demande soldats)
- Context: fabrication de jouets, profit hebdomadaire

**2. MEUBLE — Bureaux, Tables, Chaises**

- Variables: x1 (bureaux), x2 (tables), x3 (chaises)
- Max: 60x1 + 30x2 + 20x3
- Constraints: 8x1 + 6x2 + x3 ≤ 48 (bois), 2x1 + 1.5x2 + 0.5x3 ≤ 8 (menuiserie), 4x1 + 2x2 + 1.5x3 ≤ 20 (finition)

**3. Régime Alimentaire** (minimisation)

- Variables: x1–x6 (kg de chaque aliment)
- Min: 35x1 + 30x2 + 60x3 + 50x4 + 27x5 + 22x6
- Constraints: vitamine A ≥ 9, vitamine C ≥ 19

**4. Problème Non Borné** (illustrative)

- Max: x1 + 2x2
- Constraints: 7x1 + 2x2 ≥ 28, x1 + 6x2 ≥ 12

**5. Solutions Infinies** (illustrative)

- Max: 3x1 + 2x2
- Constraints: 3x1 + 2x2 ≤ 120, x1 + x2 ≤ 50

---

## Features Checklist

- [ ] Add / remove variables dynamically
- [ ] Add / remove constraints dynamically
- [ ] Max / Min toggle
- [ ] Solve LP with full step-by-step tableau recording
- [ ] Detect optimal / infeasible / unbounded
- [ ] Integer violation detection with warning UI
- [ ] Sensitivity analysis (shadow prices, RHS ranges, objective ranges)
- [ ] Dual problem auto-construction and display
- [ ] 2D feasible region graph (2 variables only)
- [ ] Step-by-step tableau viewer with pivot highlighting
- [ ] Streaming AI analysis via server-side API route
- [ ] AI analysis rendered as structured markdown
- [ ] 5 pre-loaded example problems
- [ ] Problem history saved to localStorage
- [ ] Export to PDF (problem + solution + sensitivity + AI analysis)
- [ ] Copy AI analysis to clipboard
- [ ] Fully responsive (mobile-first)
- [ ] All numbers rounded to 3 decimal places; integers shown as integers
- [ ] Loading states on all async operations
- [ ] Error boundaries on solver and AI components
- [ ] KaTeX math rendering for problem formulations and dual

---

## Numerical Robustness

- Use an epsilon tolerance of `1e-9` for all zero comparisons in the simplex engine
- Round all displayed numbers to 3 decimal places using a shared `formatNum(v: number): string` utility
- If a value is within `1e-6` of an integer, display it as an integer
- Handle `Infinity` and `-Infinity` in sensitivity ranges — display as `+∞` / `-∞`

---

## Environment Variables

```env
AI_PROVIDER=openai
AI_MODEL=gpt-4o
AI_API_KEY=your_key_here
AI_BASE_URL=https://api.openai.com/v1
```

Never expose `AI_API_KEY` to the client. It is only used in `app/api/analyze/route.ts`.

---

## Quality Standards

- TypeScript strict mode, no `any`
- Simplex engine is a pure function — no React state, no side effects, fully unit-testable
- All async actions have loading and error states
- Accessible: ARIA labels, keyboard navigation, focus management
- No hardcoded strings in French — centralize UI copy in a `lib/i18n.ts` constants file
- Git-ready: `.env.local` in `.gitignore`, `README.md` with setup instructions

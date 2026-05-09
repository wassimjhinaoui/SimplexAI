"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import { Activity, AlertTriangle, Bot, CheckCircle2, Download, FilePlus2, Info, KeyRound, LineChart, Save, Sigma, Sparkles, Table2, Trash2, XCircle } from "lucide-react";
import { BlockMath } from "react-katex";
import ReactMarkdown from "react-markdown";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { examples } from "@/lib/examples";
import { copy } from "@/lib/i18n";
import { deriveDual } from "@/lib/simplex/dual";
import type { Constraint, LPProblem, LPResult, TableauStep, Variable } from "@/lib/simplex/types";
import { cn, formatNum, linearExpressionToLatex, linearTermToLatex, uid, variableNameParts } from "@/lib/utils";
import { type AIAnalysisSource, useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useSolver } from "@/hooks/useSolver";

type Tab = "tableau" | "sensibilite" | "dual" | "graphe";
const showAiDebug = process.env.NODE_ENV !== "production";

interface AIStatus {
  provider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
}

interface SavedProblem {
  id: string;
  name: string;
  updatedAt: string;
  problem: LPProblem;
}

const savedProblemsKey = "simplex-ai-saved-problems";

export default function SolverPage() {
  const [problem, setProblem] = useState<LPProblem>(() => createBlankProblem());
  const [activeTab, setActiveTab] = useState<Tab>("tableau");
  const [activeStep, setActiveStep] = useState(0);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [savedProblems, setSavedProblems] = useState<SavedProblem[]>([]);
  const [currentProblemName, setCurrentProblemName] = useState("Nouveau problème");
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const { result, isSolving, error, solve } = useSolver();
  const { analysis, isStreaming, error: analysisError, source, providerLabel, analyze } = useAIAnalysis();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rawSaved = window.localStorage.getItem(savedProblemsKey);
      if (!rawSaved) return;
      try {
        setSavedProblems(JSON.parse(rawSaved) as SavedProblem[]);
      } catch {
        window.localStorage.removeItem(savedProblemsKey);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showAiDebug) return;
    fetch("/api/analyze")
      .then((response) => response.json() as Promise<AIStatus>)
      .then(setAiStatus)
      .catch(() => setAiStatus(null));
  }, []);

  const handleSolve = async () => {
    const solved = solve(problem);
    setActiveStep(0);
    if (solved) {
      if (aiEnabled && solved.status === "optimal") await analyze(problem, solved);
    }
  };

  const handleNewProblem = () => {
    setProblem(createBlankProblem());
    setCurrentProblemName("Nouveau problème");
    setCurrentSavedId(null);
  };

  const persistSavedProblems = (nextSavedProblems: SavedProblem[]) => {
    setSavedProblems(nextSavedProblems);
    localStorage.setItem(savedProblemsKey, JSON.stringify(nextSavedProblems));
  };

  const handleSaveProblem = () => {
    const safeName = currentProblemName.trim() || "Problème sans titre";
    const savedProblem: SavedProblem = {
      id: currentSavedId ?? uid("problem"),
      name: safeName,
      updatedAt: new Date().toISOString(),
      problem,
    };
    const nextSavedProblems = currentSavedId
      ? savedProblems.map((item) => (item.id === currentSavedId ? savedProblem : item))
      : [savedProblem, ...savedProblems];
    setCurrentSavedId(savedProblem.id);
    persistSavedProblems(nextSavedProblems);
  };

  const handleLoadProblem = (id: string) => {
    const saved = savedProblems.find((item) => item.id === id);
    if (!saved) return;
    setProblem(structuredClone(saved.problem));
    setCurrentProblemName(saved.name);
    setCurrentSavedId(saved.id);
  };

  const handleDeleteProblem = (id: string) => {
    const nextSavedProblems = savedProblems.filter((item) => item.id !== id);
    persistSavedProblems(nextSavedProblems);
    if (currentSavedId === id) {
      setCurrentSavedId(null);
      setCurrentProblemName("Nouveau problème");
    }
  };

  return (
    <main className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-serif text-2xl text-text">
            {copy.appName}
          </Link>
          <span className="text-xs uppercase tracking-[0.25em] text-text-2">Solveur RO</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-5">
          <GuidePanel aiStatus={aiStatus} showAiDebug={showAiDebug} />
          <ProblemLibrary
            problemName={currentProblemName}
            currentSavedId={currentSavedId}
            savedProblems={savedProblems}
            onNameChange={setCurrentProblemName}
            onNew={handleNewProblem}
            onSave={handleSaveProblem}
            onLoad={handleLoadProblem}
            onDelete={handleDeleteProblem}
            onExample={(name, nextProblem) => {
              setProblem(structuredClone(nextProblem));
              setCurrentProblemName(name);
              setCurrentSavedId(null);
            }}
          />
          <AIToggle enabled={aiEnabled} onChange={setAiEnabled} />
          <VariablesEditor problem={problem} onChange={setProblem} />
          <ObjectiveEditor problem={problem} onChange={setProblem} />
          <ConstraintsEditor problem={problem} onChange={setProblem} />
          <Panel title={copy.solver.context}>
            <textarea
              value={problem.context}
              onChange={(event) => setProblem({ ...problem, context: event.target.value })}
              className="min-h-28 w-full rounded-md border border-border-2 bg-surface-3 p-3 text-sm text-text outline-none focus:border-accent"
            />
          </Panel>
          <button
            type="button"
            onClick={handleSolve}
            disabled={isSolving}
            className="flex w-full items-center justify-center rounded-md bg-accent px-5 py-4 text-sm font-semibold text-bg transition hover:bg-accent-3 disabled:cursor-wait disabled:opacity-70"
          >
            {isSolving ? "Calcul en cours..." : copy.solver.solve}
          </button>
          {error ? <p className="rounded-md border border-red/40 bg-red/10 p-3 text-sm text-red">{error}</p> : null}
        </section>

        <section className="space-y-5">
          <ProblemPreview problem={problem} />
          {result ? (
            <ResultsPanel
              problem={problem}
              result={result}
              activeTab={activeTab}
              activeStep={activeStep}
              onTabChange={setActiveTab}
              onStepChange={setActiveStep}
            />
          ) : (
            <div className="rounded-lg border border-border bg-surface p-8 text-text-2">
              Lancez un calcul pour afficher les tableaux, la sensibilité, le dual et le graphe.
            </div>
          )}
        </section>
      </div>

      {aiEnabled && result?.status === "optimal" ? (
        <section className="mx-auto max-w-7xl px-4 pb-10">
          <AIAnalysis
            problem={problem}
            result={result}
            text={analysis}
            isStreaming={isStreaming}
            error={analysisError}
            source={source}
            providerLabel={providerLabel}
            showAiDebug={showAiDebug}
          />
        </section>
      ) : null}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="glass-panel rounded-lg border border-border p-4"
    >
      <h2 className="mb-4 flex items-center gap-2 font-serif text-2xl text-text">
        <span className="h-2 w-2 rounded-full bg-accent-3" />
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function GuidePanel({ aiStatus, showAiDebug }: { aiStatus: AIStatus | null; showAiDebug: boolean }) {
  const configured = aiStatus?.hasApiKey;
  return (
    <section className="glass-panel rounded-lg border border-border p-4">
      <div className={cn("grid gap-3", showAiDebug && "md:grid-cols-[1.2fr_0.8fr]")}>
        <div>
          <h1 className="flex items-center gap-2 font-serif text-3xl text-text">
            <Sparkles className="h-6 w-6 text-accent-3" />
            Construire, résoudre, interpréter
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-2">
            Choisissez un exemple ou modifiez les coefficients. Le solveur calcule la solution, puis l&apos;analyse IA explique le résultat avec le contexte que vous écrivez.
          </p>
        </div>
        {showAiDebug ? (
          <div className={cn("rounded-md border p-3 text-sm", configured ? "border-green/50 bg-green/10 text-green" : "border-amber/60 bg-amber/10 text-amber")}>
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4" />
              Configuration IA
            </div>
            <p>{configured ? "Clé API détectée: réponse générée par le fournisseur." : "Aucune clé API: mode démo local."}</p>
            <p className="mt-2 text-xs opacity-80">
              {aiStatus ? `${aiStatus.provider} / ${aiStatus.model}` : "Chargement de la configuration..."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProblemPreview({ problem }: { problem: LPProblem }) {
  const variableNames = problem.variables.map((variable) => variable.name);
  const objective = `${problem.objective.direction === "max" ? "\\max" : "\\min"}\\; Z = ${linearExpressionToLatex(problem.objective.coefficients, variableNames)}`;

  return (
    <section className="glass-panel rounded-lg border border-border p-4">
      <h2 className="mb-3 flex items-center gap-2 font-serif text-2xl text-text">
        <Info className="h-5 w-5 text-accent" />
        Formulation actuelle
      </h2>
      <div className="rounded-md border border-border-2 bg-surface-2 p-3 text-[1.08rem]">
        <BlockMath math={objective} />
      </div>
      <div className="mt-3 space-y-2">
        {problem.constraints.map((constraint) => (
          <div key={constraint.id} className="rounded-md border border-border bg-surface/70 px-3 py-2">
            <p className="mb-1 text-xs text-text-2">{constraint.label}</p>
            <BlockMath
              math={`${linearExpressionToLatex(constraint.coefficients, variableNames, true)} ${constraint.sense.replace("<=", "\\le").replace(">=", "\\ge")} ${formatNum(constraint.rhs)}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProblemLibrary({
  problemName,
  currentSavedId,
  savedProblems,
  onNameChange,
  onNew,
  onSave,
  onLoad,
  onDelete,
  onExample,
}: {
  problemName: string;
  currentSavedId: string | null;
  savedProblems: SavedProblem[];
  onNameChange: (name: string) => void;
  onNew: () => void;
  onSave: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onExample: (name: string, problem: LPProblem) => void;
}) {
  return (
    <Panel title="Problèmes">
      <div className="grid gap-3">
        <Input label="Nom du problème" value={problemName} onChange={onNameChange} />
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onNew} className="inline-flex items-center justify-center gap-2 rounded-md border border-border-2 px-4 py-2 text-sm text-text-2 transition hover:border-accent hover:text-accent">
            <FilePlus2 className="h-4 w-4" />
            Nouveau vide
          </button>
          <button type="button" onClick={onSave} className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:bg-accent-3">
            <Save className="h-4 w-4" />
            Enregistrer
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            aria-label="Charger un problème sauvegardé"
            onChange={(event) => {
              if (event.target.value) onLoad(event.target.value);
            }}
            className="w-full rounded-md border border-border-2 bg-surface-3 px-3 py-3 text-sm text-text outline-none focus:border-accent"
            defaultValue=""
          >
            <option value="">Mes problèmes sauvegardés</option>
            {savedProblems.map((saved) => (
              <option key={saved.id} value={saved.id}>
                {saved.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (currentSavedId) onDelete(currentSavedId);
            }}
            disabled={!currentSavedId}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-red/50 px-3 py-2 text-sm text-red disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        </div>
        <details className="rounded-md border border-border-2 bg-surface-2 p-3">
          <summary className="cursor-pointer text-sm text-text-2">Utiliser un exemple comme modèle</summary>
          <select
            aria-label="Choisir un exemple"
            onChange={(event) => {
              const found = examples.find((example) => example.name === event.target.value);
              if (found) onExample(found.name, found.problem);
              event.currentTarget.value = "";
            }}
            className="mt-3 w-full rounded-md border border-border-2 bg-surface-3 px-3 py-3 text-sm text-text outline-none focus:border-accent"
            defaultValue=""
          >
            <option value="">Choisir un modèle</option>
            {examples.map((example) => (
              <option key={example.name} value={example.name}>
                {example.name}
              </option>
            ))}
          </select>
        </details>
      </div>
    </Panel>
  );
}

function AIToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <section className="glass-panel rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl text-text">Analyse IA</h2>
          <p className="mt-1 text-sm text-text-2">
            {enabled ? "Après une solution optimale, l'analyse sera générée automatiquement." : "Le solveur calculera uniquement la solution mathématique."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={cn("relative h-8 w-16 rounded-full border transition", enabled ? "border-accent bg-accent/30" : "border-border-2 bg-surface-3")}
        >
          <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-text transition", enabled ? "left-9" : "left-1")} />
          <span className="sr-only">Activer ou désactiver l&apos;analyse IA</span>
        </button>
      </div>
    </section>
  );
}

function VariablesEditor({ problem, onChange }: EditorProps) {
  const updateVariable = (index: number, patch: Partial<Variable>) => {
    onChange({ ...problem, variables: problem.variables.map((variable, i) => (i === index ? { ...variable, ...patch } : variable)) });
  };

  return (
    <Panel title={copy.solver.variables}>
      <div className="space-y-3">
        {problem.variables.map((variable, index) => (
          <div key={variable.id} className="grid gap-2 rounded-md border border-border bg-surface-2 p-3 md:grid-cols-[0.7fr_1.4fr_auto_auto_auto]">
            <Input label="Nom" value={variable.name} onChange={(value) => updateVariable(index, { name: value })} />
            <Input label="Description" value={variable.description} onChange={(value) => updateVariable(index, { description: value })} />
            <Check label="Entier" checked={variable.isInteger} onChange={(checked) => updateVariable(index, { isInteger: checked })} />
            <Check label="≥ 0" checked={variable.isNonNegative} onChange={(checked) => updateVariable(index, { isNonNegative: checked })} />
            <DeleteButton
              label="Supprimer la variable"
              onClick={() => removeVariable(problem, onChange, index)}
              disabled={problem.variables.length <= 1}
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => addVariable(problem, onChange)} className="mt-4 rounded-md border border-accent px-4 py-2 text-sm text-accent">
        {copy.solver.addVariable}
      </button>
    </Panel>
  );
}

function ObjectiveEditor({ problem, onChange }: EditorProps) {
  return (
    <Panel title={copy.solver.objective}>
      <div className="mb-4 inline-flex rounded-md border border-border-2 bg-surface-3 p-1">
        {(["max", "min"] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            onClick={() => onChange({ ...problem, objective: { ...problem.objective, direction } })}
            className={cn("rounded px-4 py-2 text-sm", problem.objective.direction === direction && "bg-accent text-bg")}
          >
            {direction.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {problem.variables.map((variable, index) => (
          <NumberInput
            key={variable.id}
            label={variable.name}
            value={problem.objective.coefficients[index] ?? 0}
            onChange={(value) =>
              onChange({
                ...problem,
                objective: {
                  ...problem.objective,
                  coefficients: problem.objective.coefficients.map((coefficient, i) => (i === index ? value : coefficient)),
                },
              })
            }
          />
        ))}
      </div>
    </Panel>
  );
}

function ConstraintsEditor({ problem, onChange }: EditorProps) {
  const updateConstraint = (index: number, patch: Partial<Constraint>) => {
    onChange({ ...problem, constraints: problem.constraints.map((constraint, i) => (i === index ? { ...constraint, ...patch } : constraint)) });
  };

  return (
    <Panel title={copy.solver.constraints}>
      <div className="space-y-3">
        {problem.constraints.map((constraint, index) => (
          <div key={constraint.id} className="rounded-md border border-border bg-surface-2 p-3">
            <div className="grid gap-2 md:grid-cols-4">
              {problem.variables.map((variable, variableIndex) => (
                <NumberInput
                  key={variable.id}
                  label={variable.name}
                  value={constraint.coefficients[variableIndex] ?? 0}
                  onChange={(value) =>
                    updateConstraint(index, {
                      coefficients: constraint.coefficients.map((coefficient, i) => (i === variableIndex ? value : coefficient)),
                    })
                  }
                />
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[0.7fr_1fr_1.5fr_auto]">
              <label className="text-xs text-text-2">
                Sens
                <select
                  value={constraint.sense}
                  onChange={(event) => updateConstraint(index, { sense: event.target.value as Constraint["sense"] })}
                  className="mt-1 w-full rounded-md border border-border-2 bg-surface-3 px-3 py-2 text-text outline-none"
                >
                  <option value="<=">{"<="}</option>
                  <option value=">=">{">="}</option>
                  <option value="=">=</option>
                </select>
              </label>
              <NumberInput label="RHS" value={constraint.rhs} onChange={(value) => updateConstraint(index, { rhs: value })} />
              <Input label="Libellé" value={constraint.label} onChange={(value) => updateConstraint(index, { label: value })} />
              <DeleteButton
                label="Supprimer la contrainte"
                onClick={() => onChange({ ...problem, constraints: problem.constraints.filter((_, i) => i !== index) })}
                disabled={problem.constraints.length <= 1}
              />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => addConstraint(problem, onChange)} className="mt-4 rounded-md border border-accent px-4 py-2 text-sm text-accent">
        {copy.solver.addConstraint}
      </button>
    </Panel>
  );
}

interface EditorProps {
  problem: LPProblem;
  onChange: (problem: LPProblem) => void;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-text-2">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-border-2 bg-surface-3 px-3 py-2 text-text outline-none focus:border-accent" />
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs text-text-2">
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full rounded-md border border-border-2 bg-surface-3 px-3 py-2 text-text outline-none focus:border-accent" />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 self-end rounded-md border border-border-2 bg-surface-3 px-3 py-2 text-xs text-text-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function DeleteButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="self-end rounded-md border border-red/50 px-3 py-2 text-red disabled:opacity-30">
      ×
    </button>
  );
}

function VariableName({ name }: { name: string }) {
  const parts = variableNameParts(name);
  return (
    <span>
      {parts.base}
      {parts.subscript ? <sub>{parts.subscript}</sub> : null}
    </span>
  );
}

function formatVariablePlain(name: string): string {
  const parts = variableNameParts(name);
  return parts.subscript ? `${parts.base}${parts.subscript}` : parts.base;
}

function ResultsPanel(props: {
  problem: LPProblem;
  result: LPResult;
  activeTab: Tab;
  activeStep: number;
  onTabChange: (tab: Tab) => void;
  onStepChange: (step: number) => void;
}) {
  const { problem, result, activeTab, activeStep, onTabChange, onStepChange } = props;
  const statusClass = result.status === "optimal" ? "border-green bg-green/10 text-green" : result.status === "unbounded" ? "border-amber bg-amber/10 text-amber" : "border-red bg-red/10 text-red";
  const StatusIcon = result.status === "optimal" ? CheckCircle2 : result.status === "unbounded" ? AlertTriangle : XCircle;
  const step = result.iterations[Math.min(activeStep, result.iterations.length - 1)];

  return (
    <div className="space-y-5">
      <div className={cn("flex items-center gap-3 rounded-lg border p-4 text-sm", statusClass)}>
        <StatusIcon className="h-5 w-5" />
        {result.status === "optimal" ? copy.solver.optimal : result.status === "unbounded" ? copy.solver.unbounded : copy.solver.infeasible}
      </div>
      {result.integerViolations.length ? (
        <div className="rounded-lg border border-amber bg-amber/10 p-4 text-sm text-amber">
          Variables entières non respectées: {result.integerViolations.map((index) => formatVariablePlain(problem.variables[index]?.name ?? "")).join(", ")}. Utilisez Branch & Bound ou vérifiez le modèle.
        </div>
      ) : null}
      {result.branchAndBound?.enabled ? (
        <div className="rounded-lg border border-accent bg-accent/10 p-4 text-sm text-accent">
          Branch & Bound appliqué sur {result.branchAndBound.integerVariableNames.map(formatVariablePlain).join(", ")}: {result.branchAndBound.nodesExplored} noeuds explorés. {result.branchAndBound.message}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {problem.variables.map((variable, index) => (
          <div key={variable.id} className={cn("rounded-lg border bg-surface p-4", result.integerViolations.includes(index) ? "border-amber" : "border-border")}>
            <p className="text-xs text-text-2"><VariableName name={variable.name} /></p>
            <p className="mt-2 text-3xl text-text">{formatNum(result.solution[index] ?? 0)}</p>
          </div>
        ))}
        <div className="rounded-lg border border-accent bg-accent/10 p-4 md:col-span-2">
          <p className="text-xs text-accent">{problem.objective.direction.toUpperCase()} Z*</p>
          <p className="mt-2 text-4xl text-text">{formatNum(result.objectiveValue)}</p>
        </div>
      </div>
      <div className="glass-panel rounded-lg border border-border p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["tableau", "sensibilite", "dual", "graphe"] as Tab[]).map((tab) => (
            <button key={tab} type="button" onClick={() => onTabChange(tab)} className={cn("rounded-md border border-border-2 px-3 py-2 text-sm capitalize text-text-2", activeTab === tab && "border-accent bg-accent text-bg")}>
              <span className="inline-flex items-center gap-2">
                <TabIcon tab={tab} />
                {tab}
              </span>
            </button>
          ))}
        </div>
        {activeTab === "tableau" && step ? <TableauViewer step={step} steps={result.iterations} activeStep={activeStep} onStepChange={onStepChange} /> : null}
        {activeTab === "sensibilite" ? <SensitivityPanel problem={problem} result={result} /> : null}
        {activeTab === "dual" ? <DualPanel problem={problem} result={result} /> : null}
        {activeTab === "graphe" ? <GraphPanel problem={problem} result={result} /> : null}
      </div>
    </div>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  const className = "h-4 w-4";
  if (tab === "tableau") return <Table2 className={className} />;
  if (tab === "sensibilite") return <LineChart className={className} />;
  if (tab === "dual") return <Sigma className={className} />;
  return <Activity className={className} />;
}

function TableauViewer({ step, steps, activeStep, onStepChange }: { step: TableauStep; steps: TableauStep[]; activeStep: number; onStepChange: (step: number) => void }) {
  const rhsIndex = step.colNames.length;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onStepChange(Math.max(0, activeStep - 1))} className="rounded border border-border-2 px-3 py-2 text-sm text-text-2">Précédent</button>
        {steps.map((candidate, index) => (
          <button key={candidate.iteration} type="button" onClick={() => onStepChange(index)} className={cn("rounded px-3 py-2 text-xs", activeStep === index ? "bg-accent text-bg" : "bg-surface-3 text-text-2")}>
            {candidate.iteration}
          </button>
        ))}
        <button type="button" onClick={() => onStepChange(Math.min(steps.length - 1, activeStep + 1))} className="rounded border border-border-2 px-3 py-2 text-sm text-text-2">Suivant</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-right text-xs">
          <thead>
            <tr>
              <th className="border border-border-2 p-2 text-left">Base</th>
              {step.colNames.map((name, index) => (
                <th key={name} className={cn("border border-border-2 p-2", step.basis.includes(index) && "text-accent-3")}><VariableName name={name} /></th>
              ))}
              <th className="border border-border-2 p-2">RHS</th>
            </tr>
          </thead>
          <tbody>
            {step.tableau.map((row, rowIndex) => (
              <tr key={`${step.iteration}-${rowIndex}`}>
                <th className="border border-border-2 p-2 text-left text-accent-3">{rowIndex === step.tableau.length - 1 ? "Z" : <VariableName name={step.colNames[step.basis[rowIndex] ?? 0] ?? ""} />}</th>
                {row.map((value, colIndex) => (
                  <td key={colIndex} className={cn("border border-border-2 p-2", rowIndex === step.pivotRow && colIndex === step.pivotCol && "bg-accent text-bg", rowIndex === step.tableau.length - 1 && colIndex < rhsIndex && value < 0 && "text-green", rowIndex === step.tableau.length - 1 && colIndex < rhsIndex && value > 0 && "text-red")}>{formatNum(value)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm leading-6 text-text-2">{step.explanation}</p>
    </div>
  );
}

function SensitivityPanel({ problem, result }: { problem: LPProblem; result: LPResult }) {
  const chartData = result.sensitivity.shadowPrices.map((price) => ({
    label: price.label,
    value: Number(price.value.toFixed(6)),
  }));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="text-text-2"><th className="p-2">Contrainte</th><th className="p-2">RHS</th><th className="p-2">Prix</th><th className="p-2">Statut</th><th className="p-2">Intervalle</th></tr></thead>
          <tbody>
            {result.sensitivity.rhsRanges.map((range, index) => (
              <tr key={range.constraintIndex} className="border-t border-border">
                <td className="p-2">{problem.constraints[index]?.label}</td>
                <td className="p-2">{formatNum(range.currentRHS)}</td>
                <td className="p-2">{formatNum(range.shadowPrice)}</td>
                <td className="p-2">{result.sensitivity.shadowPrices[index]?.isBinding ? "Active" : "Inactive"}</td>
                <td className="p-2">[{formatNum(range.lowerBound)}, {formatNum(range.upperBound)}]</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="h-64 rounded-md border border-border-2 bg-surface-2 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid stroke="rgba(138,144,168,0.15)" />
            <XAxis type="number" stroke="var(--text-2)" tick={{ fill: "var(--text-2)", fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={110} stroke="var(--text-2)" tick={{ fill: "var(--text-2)", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "rgba(79,142,247,0.08)" }}
              contentStyle={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", color: "var(--text)" }}
              formatter={(value) => formatNum(Number(value))}
            />
            <Bar dataKey="value" radius={[4, 4, 4, 4]}>
              {chartData.map((entry) => (
                <Cell key={entry.label} fill={entry.value >= 0 ? "var(--green)" : "var(--red)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DualPanel({ problem, result }: { problem: LPProblem; result: LPResult }) {
  const dual = useMemo(() => deriveDual(problem), [problem]);
  const objective = `${dual.objective.direction === "max" ? "\\max" : "\\min"}\\; W = ${dual.objective.coefficients.map((coefficient, index) => linearTermToLatex(coefficient, dual.variables[index]?.name ?? "")).join(" + ")}`;
  return (
    <div className="space-y-3 text-sm text-text-2">
      <div className="rounded-md border border-border-2 bg-surface-2 p-4 text-text">
        <BlockMath math={objective} />
      </div>
      {dual.constraints.map((constraint) => (
        <div key={constraint.id} className="rounded-md bg-surface-2 px-3 py-2">
          <BlockMath math={`${constraint.coefficients.map((coefficient, index) => linearTermToLatex(coefficient, dual.variables[index]?.name ?? "")).join(" + ")} ${constraint.sense.replace("<=", "\\le").replace(">=", "\\ge")} ${formatNum(constraint.rhs)}`} />
        </div>
      ))}
      <p className="text-accent-3">Solution duale estimée: {result.dualSolution.map((value, index) => `${formatVariablePlain(dual.variables[index]?.name ?? "")}=${formatNum(value)}`).join(", ")}</p>
    </div>
  );
}

function GraphPanel({ problem, result }: { problem: LPProblem; result: LPResult }) {
  if (problem.variables.length !== 2 || result.status !== "optimal") {
    return <p className="text-sm text-text-2">Le graphe est disponible uniquement pour deux variables et une solution optimale.</p>;
  }
  const vertices = computeVertices(problem);
  const maxCoord = Math.max(10, ...vertices.flatMap((point) => point), ...result.solution.slice(0, 2)) * 1.15;
  const toX = (x: number) => 42 + (x / maxCoord) * 300;
  const toY = (y: number) => 342 - (y / maxCoord) * 300;
  const polygon = vertices.map(([x, y]) => `${toX(x)},${toY(y)}`).join(" ");
  return (
    <svg viewBox="0 0 380 380" className="h-auto w-full rounded-md border border-border-2 bg-surface-2" role="img" aria-label="Région réalisable">
      <line x1="42" y1="342" x2="360" y2="342" stroke="var(--text-3)" />
      <line x1="42" y1="342" x2="42" y2="24" stroke="var(--text-3)" />
      {vertices.length ? <polygon points={polygon} fill="rgba(62,207,142,0.16)" stroke="var(--accent-3)" /> : null}
      {problem.constraints.map((constraint, index) => {
        const [a, b] = constraint.coefficients;
        const p1 = b ? [0, constraint.rhs / b] : [constraint.rhs / (a || 1), 0];
        const p2 = a ? [constraint.rhs / a, 0] : [0, constraint.rhs / (b || 1)];
        return <line key={constraint.id} x1={toX(p1[0])} y1={toY(p1[1])} x2={toX(p2[0])} y2={toY(p2[1])} stroke={index % 2 ? "var(--accent)" : "var(--accent-2)"} strokeWidth="1.5" />;
      })}
      {vertices.map(([x, y]) => (
        <g key={`${x}-${y}`}><circle cx={toX(x)} cy={toY(y)} r="4" fill="var(--text)" /><title>{`(${formatNum(x)}, ${formatNum(y)}) Z=${formatNum(problem.objective.coefficients[0] * x + problem.objective.coefficients[1] * y)}`}</title></g>
      ))}
      <circle cx={toX(result.solution[0] ?? 0)} cy={toY(result.solution[1] ?? 0)} r="7" fill="var(--amber)" />
      <text x={toX(result.solution[0] ?? 0) + 9} y={toY(result.solution[1] ?? 0) - 9} fill="var(--amber)" fontSize="12">Optimum</text>
      <text x="320" y="362" fill="var(--text-2)" fontSize="11">{formatVariablePlain(problem.variables[0]?.name ?? "")}</text>
      <text x="10" y="30" fill="var(--text-2)" fontSize="11">{formatVariablePlain(problem.variables[1]?.name ?? "")}</text>
    </svg>
  );
}

function AIAnalysis({
  problem,
  result,
  text,
  isStreaming,
  error,
  source,
  providerLabel,
  showAiDebug,
}: {
  problem: LPProblem;
  result: LPResult;
  text: string;
  isStreaming: boolean;
  error: string | null;
  source: AIAnalysisSource;
  providerLabel: string | null;
  showAiDebug: boolean;
}) {
  const isProvider = source === "provider";
  return (
    <section className="glass-panel rounded-lg border border-border p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-3 font-serif text-3xl">
            <Bot className="h-7 w-7 text-accent-3" />
            Analyse IA
          </h2>
          {showAiDebug ? (
            <div className={cn("mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs", isProvider ? "border-green/60 bg-green/10 text-green" : "border-amber/60 bg-amber/10 text-amber")}>
              <span className={cn("h-2 w-2 rounded-full", isProvider ? "bg-green" : "bg-amber")} />
              {isProvider ? `IA réelle: ${providerLabel ?? "fournisseur configuré"}` : "Mode démo local: aucune réponse fournisseur confirmée"}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => exportPdf(problem, result, text)} className="inline-flex items-center gap-2 rounded-md border border-border-2 px-3 py-2 text-sm text-text-2">
            <Download className="h-4 w-4" />
            PDF
          </button>
          <button type="button" onClick={() => navigator.clipboard.writeText(text)} className="rounded-md border border-accent px-3 py-2 text-sm text-accent">Copier l&apos;analyse</button>
        </div>
      </div>
      {isStreaming && !text ? <p className="animate-pulse text-accent-3">Analyse en cours...</p> : null}
      {error ? <p className="text-amber">{error}</p> : null}
      <div className="max-w-none text-sm leading-7">
        <ReactMarkdown
          components={{
            h2: ({ children }) => (
              <h2 className="mt-6 inline-flex rounded-md border border-accent-3/40 bg-accent-3/10 px-2.5 py-1 text-sm font-semibold text-accent-3">
                {children}
              </h2>
            ),
            p: ({ children }) => <p className="mt-3 text-text-2">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
            em: ({ children }) => <em className="text-accent">{children}</em>,
            ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 text-text-2">{children}</ul>,
            ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-text-2">{children}</ol>,
            li: ({ children }) => <li className="marker:text-accent-3">{children}</li>,
            code: ({ children }) => <code className="rounded bg-surface-3 px-1.5 py-0.5 text-accent-3">{children}</code>,
          }}
        >
          {text}
        </ReactMarkdown>
        {isStreaming ? <span className="text-accent">|</span> : null}
      </div>
    </section>
  );
}

function exportPdf(problem: LPProblem, result: LPResult, analysis: string) {
  const doc = new jsPDF();
  const margin = 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 16;

  const addLine = (text: string, size = 10, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(normalizePdfText(text), 182) as string[];
    wrapped.forEach((line) => {
      if (y > pageHeight - 16) {
        doc.addPage();
        y = 16;
      }
      doc.text(line, margin, y);
      y += size * 0.48;
    });
    y += 2;
  };

  const addSection = (title: string) => {
    y += 3;
    addLine(title, 13, "bold");
  };

  addLine("SimplexAI - Rapport de resolution", 16, "bold");
  addLine(`Statut: ${result.status}`);
  addLine(`Objectif: ${problem.objective.direction.toUpperCase()} Z* = ${formatNum(result.objectiveValue)}`);

  addSection("1. Formulation");
  addLine(`${problem.objective.direction.toUpperCase()} Z = ${plainLinearExpression(problem.objective.coefficients, problem.variables.map((variable) => variable.name))}`);
  problem.constraints.forEach((constraint) => {
    addLine(`${constraint.label}: ${plainLinearExpression(constraint.coefficients, problem.variables.map((variable) => variable.name), true)} ${constraint.sense} ${formatNum(constraint.rhs)}`);
  });

  addSection("2. Solution");
  problem.variables.forEach((variable, index) => {
    addLine(`${plainVariableName(variable.name)} = ${formatNum(result.solution[index] ?? 0)}${variable.description ? ` - ${variable.description}` : ""}`);
  });
  if (result.branchAndBound?.enabled) {
    addLine(`Branch & Bound: ${result.branchAndBound.nodesExplored} noeuds explores.`);
  }

  addSection("3. Sensibilite");
  result.sensitivity.rhsRanges.forEach((range) => {
    const label = problem.constraints[range.constraintIndex]?.label ?? `Contrainte ${range.constraintIndex + 1}`;
    addLine(`${label}: prix ${formatNum(range.shadowPrice)}, intervalle [${formatNum(range.lowerBound)}, ${formatNum(range.upperBound)}]`);
  });

  addSection("4. Analyse IA");
  stripMarkdown(analysis || "Analyse non disponible.").split("\n").forEach((line) => {
    if (line.trim()) addLine(line.trim());
  });

  doc.save("simplex-ai-rapport.pdf");
}

function plainLinearExpression(
  coefficients: number[],
  variableNames: string[],
  includeZeroTerms = false,
): string {
  const terms = coefficients.flatMap((coefficient, index) => {
    if (!includeZeroTerms && Math.abs(coefficient) < 1e-9) return [];
    return [`${formatNum(coefficient)}*${plainVariableName(variableNames[index] ?? `x${index + 1}`)}`];
  });
  return terms.length ? terms.join(" + ").replace(/\+ -/g, "- ") : "0";
}

function plainVariableName(name: string): string {
  const parts = variableNameParts(name);
  return parts.subscript ? `${parts.base}_${parts.subscript}` : parts.base;
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}

function normalizePdfText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/∞/g, "inf")
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, "-");
}

function addVariable(problem: LPProblem, onChange: (problem: LPProblem) => void) {
  const index = problem.variables.length + 1;
  onChange({
    ...problem,
    variables: [...problem.variables, { id: uid("x"), name: `x${index}`, description: "", isInteger: false, isNonNegative: true }],
    objective: { ...problem.objective, coefficients: [...problem.objective.coefficients, 0] },
    constraints: problem.constraints.map((constraint) => ({ ...constraint, coefficients: [...constraint.coefficients, 0] })),
  });
}

function removeVariable(problem: LPProblem, onChange: (problem: LPProblem) => void, index: number) {
  onChange({
    ...problem,
    variables: problem.variables.filter((_, i) => i !== index),
    objective: { ...problem.objective, coefficients: problem.objective.coefficients.filter((_, i) => i !== index) },
    constraints: problem.constraints.map((constraint) => ({ ...constraint, coefficients: constraint.coefficients.filter((_, i) => i !== index) })),
  });
}

function addConstraint(problem: LPProblem, onChange: (problem: LPProblem) => void) {
  onChange({
    ...problem,
    constraints: [...problem.constraints, { id: uid("c"), coefficients: problem.variables.map(() => 0), sense: "<=", rhs: 0, label: `Contrainte ${problem.constraints.length + 1}` }],
  });
}

function createBlankProblem(): LPProblem {
  return {
    variables: [
      {
        id: "blank-x1",
        name: "x1",
        description: "",
        isInteger: false,
        isNonNegative: true,
      },
      {
        id: "blank-x2",
        name: "x2",
        description: "",
        isInteger: false,
        isNonNegative: true,
      },
    ],
    objective: {
      coefficients: [0, 0],
      direction: "max",
    },
    constraints: [
      {
        id: "blank-c1",
        coefficients: [0, 0],
        sense: "<=",
        rhs: 0,
        label: "Contrainte 1",
      },
    ],
    context: "",
  };
}

function computeVertices(problem: LPProblem): [number, number][] {
  const constraints = [
    ...problem.constraints,
    { id: "x0", coefficients: [1, 0], sense: ">=" as const, rhs: 0, label: "x >= 0" },
    { id: "y0", coefficients: [0, 1], sense: ">=" as const, rhs: 0, label: "y >= 0" },
  ];
  const points: [number, number][] = [];
  for (let i = 0; i < constraints.length; i += 1) {
    for (let j = i + 1; j < constraints.length; j += 1) {
      const [a1, b1] = constraints[i].coefficients;
      const [a2, b2] = constraints[j].coefficients;
      const det = a1 * b2 - a2 * b1;
      if (Math.abs(det) < 1e-9) continue;
      const x = (constraints[i].rhs * b2 - constraints[j].rhs * b1) / det;
      const y = (a1 * constraints[j].rhs - a2 * constraints[i].rhs) / det;
      if (constraints.every((constraint) => satisfies([x, y], constraint))) points.push([x, y]);
    }
  }
  return uniquePoints(points).sort((left, right) => Math.atan2(left[1], left[0]) - Math.atan2(right[1], right[0]));
}

function satisfies(point: [number, number], constraint: Constraint): boolean {
  const value = (constraint.coefficients[0] ?? 0) * point[0] + (constraint.coefficients[1] ?? 0) * point[1];
  if (constraint.sense === "<=") return value <= constraint.rhs + 1e-7;
  if (constraint.sense === ">=") return value >= constraint.rhs - 1e-7;
  return Math.abs(value - constraint.rhs) <= 1e-7;
}

function uniquePoints(points: [number, number][]): [number, number][] {
  return points.filter((point, index) => points.findIndex((candidate) => Math.abs(candidate[0] - point[0]) < 1e-6 && Math.abs(candidate[1] - point[1]) < 1e-6) === index);
}

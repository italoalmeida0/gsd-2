/**
 * CustomWorkflowEngine — drives custom workflows defined by GRAPH.yaml.
 *
 * Implements WorkflowEngine by reading step state from a GRAPH.yaml file
 * in the run directory, dispatching pending steps in dependency order,
 * and marking steps complete via reconcile.
 *
 * Created in S03. Uses graph.ts for all GRAPH.yaml operations.
 */

import type { WorkflowEngine } from "./workflow-engine.js";
import type {
  EngineState,
  EngineDispatchAction,
  CompletedStep,
  ReconcileResult,
  DisplayMetadata,
} from "./engine-types.js";
import {
  readGraph,
  writeGraph,
  getNextPendingStep,
  markStepComplete,
} from "./graph.js";
import type { WorkflowGraph } from "./graph.js";

// ─── GSDState-compatible stub ────────────────────────────────────────────

/**
 * Build a GSDState-compatible stub for EngineState.raw.
 *
 * The auto-loop's dispatchNextUnit() reads fields from EngineState.raw
 * (cast to GSDState) between deriveState() and resolveDispatch().
 * This stub provides neutral values that prevent crashes:
 * - activeMilestone must be non-null (otherwise the loop stops early)
 * - phase must not be "complete" or "blocked" (those trigger early returns)
 * - arrays must be present but empty
 */
function buildGSDStateStub(graph: WorkflowGraph) {
  const completed = graph.steps.filter((s) => s.status === "complete").length;
  const total = graph.steps.length;

  return {
    activeMilestone: { id: "custom-workflow", title: "Custom Workflow" },
    activeSlice: null,
    activeTask: null,
    phase: "executing",
    recentDecisions: [] as string[],
    blockers: [] as string[],
    nextAction: "",
    registry: [] as unknown[],
    // Attach graph data so resolveDispatch can access it without re-reading disk
    _graph: graph,
    progress: {
      milestones: { done: 0, total: 1 },
      tasks: { done: completed, total },
    },
  };
}

// ─── CustomWorkflowEngine ────────────────────────────────────────────────

export class CustomWorkflowEngine implements WorkflowEngine {
  readonly engineId = "custom" as const;
  private readonly runDir: string;

  constructor(runDir: string) {
    this.runDir = runDir;
  }

  async deriveState(_basePath: string): Promise<EngineState> {
    const graph = readGraph(this.runDir);
    const completed = graph.steps.filter((s) => s.status === "complete").length;
    const total = graph.steps.length;
    const allComplete = total > 0 && completed === total;
    const nextStep = getNextPendingStep(graph);

    return {
      phase: allComplete ? "complete" : "executing",
      currentMilestoneId: "custom-workflow",
      activeSliceId: nextStep?.id ?? null,
      activeTaskId: nextStep?.id ?? null,
      isComplete: allComplete,
      raw: buildGSDStateStub(graph),
    };
  }

  async resolveDispatch(
    state: EngineState,
    _context: { basePath: string },
  ): Promise<EngineDispatchAction> {
    // Re-read from disk for fresh state (reconcile may have written changes)
    const graph = readGraph(this.runDir);
    const nextStep = getNextPendingStep(graph);

    if (!nextStep) {
      return {
        action: "stop",
        reason: "All steps complete",
        level: "info",
      };
    }

    return {
      action: "dispatch",
      step: {
        unitType: "custom-step",
        unitId: nextStep.id,
        prompt: nextStep.prompt,
      },
    };
  }

  async reconcile(
    _state: EngineState,
    completedStep: CompletedStep,
  ): Promise<ReconcileResult> {
    const graph = readGraph(this.runDir);
    const updatedGraph = markStepComplete(graph, completedStep.unitId);
    writeGraph(this.runDir, updatedGraph);

    const remaining = updatedGraph.steps.filter(
      (s) => s.status !== "complete",
    );

    if (remaining.length === 0) {
      return { outcome: "stop", reason: "All steps complete" };
    }

    return { outcome: "continue" };
  }

  getDisplayMetadata(state: EngineState): DisplayMetadata {
    const completed = state.isComplete
      ? (state.raw as { _graph?: WorkflowGraph })?._graph?.steps.length ?? 0
      : (
          (state.raw as { _graph?: WorkflowGraph })?._graph?.steps.filter(
            (s) => s.status === "complete",
          ) ?? []
        ).length;

    const total =
      (state.raw as { _graph?: WorkflowGraph })?._graph?.steps.length ?? 0;

    return {
      engineLabel: "Custom Pipeline",
      currentPhase: state.phase,
      progressSummary: state.isComplete
        ? "All steps complete"
        : `Step ${completed + 1} of ${total}`,
      stepCount: { completed, total },
    };
  }
}

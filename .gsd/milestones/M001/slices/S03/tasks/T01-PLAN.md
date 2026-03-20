---
estimated_steps: 4
estimated_files: 4
---

# T01: Implement graph.ts, CustomWorkflowEngine, CustomExecutionPolicy, and wire resolveEngine "custom" branch

**Slice:** S03 — CustomWorkflowEngine — Linear Step Execution
**Milestone:** M001

## Description

Build all production code for S03: the graph data module, custom engine/policy implementations, and resolver routing. These are tightly coupled (engine reads graph, resolver creates engine) and total ~400 lines across 4 files.

The central challenge is the GSDState stub: `dispatchNextUnit()` in `auto.ts` has ~300 lines of GSDState-specific code between `engine.deriveState()` and `engine.resolveDispatch()`. The custom engine's `deriveState()` must return `EngineState.raw` as a GSDState-compatible object with neutral values so that code path doesn't crash. The key fields: `activeMilestone: null`, `activeSlice: null`, `activeTask: null`, `phase: "executing"`, `recentDecisions: []`, `blockers: []`, `nextAction: ""`, `registry: []`. With `activeMilestone` null, dispatchNextUnit will try to stop — but that's fine because the engine's `resolveDispatch()` runs before the "no milestone" guard returns (the guard at ~line 1195 checks `mid` which comes from `state.activeMilestone?.id`).

**Wait** — actually reading auto.ts more carefully: if `mid` is null (from the GSDState stub), the code at ~line 1195 will `stopAuto()` and return before ever reaching `engine.resolveDispatch()`. The stub MUST have `activeMilestone` set to a non-null value. Use a synthetic value: `{ id: "custom-workflow", title: "Custom Workflow" }`. Similarly `phase` must NOT be "complete" or "blocked" (those trigger early returns). Use `phase: "executing"`.

## Steps

1. **Create `graph.ts`** — Pure data module, zero engine dependencies. Types: `GraphStep` (id, title, status: "pending"|"active"|"complete", prompt, dependsOn: string[]), `WorkflowGraph` (steps: GraphStep[], metadata: { name: string, createdAt: string }). Functions: `readGraph(runDir: string): WorkflowGraph` (reads `GRAPH.yaml` from runDir, parses YAML), `writeGraph(runDir: string, graph: WorkflowGraph): void` (serializes to YAML, writes atomically), `getNextPendingStep(graph: WorkflowGraph): GraphStep | null` (returns first step whose status is "pending" and all `dependsOn` are "complete"), `markStepComplete(graph: WorkflowGraph, stepId: string): WorkflowGraph` (returns new graph with step status set to "complete"). Import `parse`/`stringify` from `"yaml"` and `readFileSync`/`writeFileSync`/`existsSync` from `"node:fs"`, `join` from `"node:path"`. Use `.yaml` extension consistently.

2. **Create `custom-workflow-engine.ts`** — Implements `WorkflowEngine`. Constructor takes `runDir: string`. `engineId` = `"custom"`. `deriveState(basePath)` reads GRAPH.yaml from `this.runDir`, builds `EngineState` with graph-derived phase/ids and GSDState-compatible stub in `.raw` (must have non-null `activeMilestone: { id: "custom-workflow", title: "Custom Workflow" }`, `phase: "executing"`, empty arrays). `resolveDispatch(state, context)` calls `getNextPendingStep()` on the graph from `state.raw` (store graph reference in EngineState, or re-read from disk — re-read is simpler). Returns `{ action: "dispatch", step: { unitType: "custom-step", unitId: step.id, prompt: step.prompt } }` or `{ action: "stop", reason: "All steps complete", level: "info" }`. `reconcile(state, completedStep)` reads graph, calls `markStepComplete()`, writes back, returns `{ outcome: "continue" }` or `{ outcome: "stop" }` if all done. `getDisplayMetadata(state)` returns label "Custom Pipeline", phase from state, step count completed/total.

3. **Create `custom-execution-policy.ts`** — Implements `ExecutionPolicy` with stub methods returning neutral values, identical pattern to `DevExecutionPolicy`. `prepareWorkspace` → void, `selectModel` → null, `verify` → "continue", `recover` → `{ outcome: "retry" }`, `closeout` → `{ committed: false, artifacts: [] }`.

4. **Update `engine-resolver.ts`** — Add imports for `CustomWorkflowEngine` and `CustomExecutionPolicy`. Before the `throw` line, add: `if (id.startsWith("custom:")) { const runDir = id.slice("custom:".length); return { engine: new CustomWorkflowEngine(runDir), policy: new CustomExecutionPolicy() }; }`. Keep the throw for truly unknown engine IDs.

## Must-Haves

- [ ] `graph.ts` exports `readGraph`, `writeGraph`, `getNextPendingStep`, `markStepComplete`, `GraphStep`, `WorkflowGraph`
- [ ] `custom-workflow-engine.ts` implements all 4 WorkflowEngine methods + `engineId`
- [ ] `EngineState.raw` contains GSDState-compatible stub with non-null `activeMilestone` (id: "custom-workflow"), `phase: "executing"`, empty arrays for registry/decisions/blockers
- [ ] `custom-execution-policy.ts` implements all 5 ExecutionPolicy methods as stubs
- [ ] `engine-resolver.ts` routes `"custom:*"` IDs, preserves dev and unknown-throw paths
- [ ] `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors
- [ ] All imports use `.js` extensions per project convention (resolved to `.ts` at test runtime)

## Verification

- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 type errors
- Manual inspection: `engine-resolver.ts` has 3 branches (dev, custom:*, throw)

## Inputs

- `src/resources/extensions/gsd/workflow-engine.ts` — WorkflowEngine interface to implement
- `src/resources/extensions/gsd/execution-policy.ts` — ExecutionPolicy interface to implement
- `src/resources/extensions/gsd/engine-types.ts` — EngineState, EngineDispatchAction, StepContract, CompletedStep, ReconcileResult, DisplayMetadata, RecoveryAction, CloseoutResult
- `src/resources/extensions/gsd/engine-resolver.ts` — existing resolveEngine() to extend
- `src/resources/extensions/gsd/dev-workflow-engine.ts` — reference implementation for engine patterns
- `src/resources/extensions/gsd/dev-execution-policy.ts` — reference implementation for policy stubs
- `src/resources/extensions/gsd/types.ts` — GSDState interface (for stub shape), ActiveRef, Phase types

## Expected Output

- `src/resources/extensions/gsd/graph.ts` — ~80 lines, pure data module for GRAPH.yaml operations
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — ~120 lines, CustomWorkflowEngine class
- `src/resources/extensions/gsd/custom-execution-policy.ts` — ~50 lines, stub policy
- `src/resources/extensions/gsd/engine-resolver.ts` — ~55 lines (was ~42), with custom branch added

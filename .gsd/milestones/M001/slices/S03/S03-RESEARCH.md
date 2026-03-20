# S03: CustomWorkflowEngine — Linear Step Execution — Research

**Date:** 2026-03-19
**Depth:** Targeted

## Summary

S03 adds the second engine branch: `CustomWorkflowEngine` + `CustomExecutionPolicy` + `graph.ts`. The scope is intentionally narrow — a hardcoded 3-step in-memory workflow definition (no YAML loading yet, that's S04), GRAPH.yaml for durable step state, and an integration test proving the engine derives state, dispatches steps, and marks them complete through the auto-loop's polymorphic path.

The central architectural challenge is that `dispatchNextUnit()` in `auto.ts` has ~300 lines of GSDState-specific code between `engine.deriveState()` and `engine.resolveDispatch()`. The custom engine must navigate this code without crashing. Recommended approach: return a GSDState-compatible stub in `EngineState.raw` with neutral values.

## Requirements Targeted

- R005 (supporting): Add "custom" branch to resolveEngine()

## Key findings

- graph.ts is a pure data module (GRAPH.yaml read/write) — build first, zero engine dependencies
- GSDState stub strategy lets custom engine navigate 300 lines of dev-specific code in dispatchNextUnit without modifying auto.ts
- handleAgentEnd post-unit processing is harmless for custom unit types (guarded by unitType checks)
- Engine ID format "custom:/path/to/run" encodes both engine type and run directory
- Existing test in dev-engine-contract.test.ts must be updated (resolveEngine "custom" no longer throws)
---
estimated_steps: 4
estimated_files: 1
---

# T03: Write contract test and run full test suite verification

**Slice:** S01 — Interface Extraction + LoopDeps Decomposition
**Milestone:** M001

## Description

Write a contract test that validates the new interface files are well-formed, importable, and compose correctly. Then run the full test suite (unit + integration) to prove zero regressions (R016). This is the proving step — if anything from T01 or T02 broke the codebase, this task catches it.

The contract test uses the Node.js built-in test runner (same as all other GSD tests). It validates structural properties of the interfaces — importability, field existence, type composition. It does NOT test runtime behavior (that's S02's job when implementations are built).

**Relevant skills:** None required — this is test writing with Node.js built-in test runner.

## Steps

1. Create `src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` with these test cases:
   - **Import smoke test:** Import all four new files (`engine-types.ts`, `workflow-engine.ts`, `execution-policy.ts`, `loop-deps-groups.ts`) and assert they export the expected names. Use dynamic `import()` to verify module resolution works under `--experimental-strip-types`.
   - **EngineState shape:** Create a mock object satisfying `EngineState` and verify required fields exist (`phase`, `currentMilestoneId`, `isComplete`, `raw`).
   - **EngineDispatchAction discriminated union:** Create objects for each variant (`dispatch`, `stop`, `skip`) and verify the discriminant field.
   - **WorkflowEngine method names:** Verify the interface has `deriveState`, `resolveDispatch`, `reconcile`, `getDisplayMetadata`, and `engineId`.
   - **ExecutionPolicy method names:** Verify the interface has `prepareWorkspace`, `selectModel`, `verify`, `recover`, `closeout`.
   - **AutoSession.activeEngineId:** Import `AutoSession`, create an instance, verify `activeEngineId` defaults to `null`, call `reset()`, verify it's still `null`, verify `toJSON()` includes it.
   - **Sub-interface group count:** Import `loop-deps-groups.ts` exports and verify at least 8 sub-interfaces are exported.

2. Run the new contract test in isolation:
   ```
   node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts
   ```

3. Run the full test suite:
   ```
   npm run test:unit
   npm run test:integration
   ```
   All tests must pass. If any fail, investigate the root cause — it's a bug in T01 or T02, not an expected outcome. Fix and re-run.

4. Verify no import cycles by confirming:
   ```
   grep -c "from './" src/resources/extensions/gsd/engine-types.ts
   ```
   Must return 0.

## Must-Haves

- [ ] Contract test file exists and passes
- [ ] All existing unit tests pass (zero regressions)
- [ ] All existing integration tests pass (zero regressions)
- [ ] `engine-types.ts` has zero local imports (no import cycles)

## Verification

- `npm test` passes (runs both unit and integration suites)
- Contract test passes in isolation
- Zero test failures, zero new warnings

## Inputs

- T01 output: `engine-types.ts`, `workflow-engine.ts`, `execution-policy.ts`
- T02 output: `loop-deps-groups.ts`, modified `auto/session.ts`
- Existing test infrastructure: `resolve-ts.mjs` loader, Node.js built-in test runner with `--experimental-strip-types`
- Test file location pattern: `src/resources/extensions/gsd/tests/*.test.ts`

## Expected Output

- `src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` — contract test with 7+ test cases
- Full test suite green with zero regressions

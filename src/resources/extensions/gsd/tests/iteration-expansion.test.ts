/**
 * Unit tests for expandIteration() and related graph.ts iteration support.
 *
 * Covers instance creation, deterministic ID generation, parent status
 * marking, downstream dependency rewriting, prompt template expansion,
 * getNextPendingStep interaction, YAML roundtrip, and error cases.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readGraph,
  writeGraph,
  getNextPendingStep,
  expandIteration,
} from "../graph.ts";
import type { WorkflowGraph, GraphStep } from "../graph.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-iter-test-"));
}

/** A 3-step graph: outline → draft-chapters (iterate candidate) → review */
function makeIterateGraph(): WorkflowGraph {
  return {
    steps: [
      {
        id: "outline",
        title: "Create outline",
        status: "complete",
        prompt: "Write an outline",
        dependsOn: [],
      },
      {
        id: "draft-chapters",
        title: "Draft chapters",
        status: "pending",
        prompt: "Draft {{item}}",
        dependsOn: ["outline"],
      },
      {
        id: "review",
        title: "Review all",
        status: "pending",
        prompt: "Review the book",
        dependsOn: ["draft-chapters"],
      },
    ],
    metadata: {
      name: "iterate-test",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

// ─── expandIteration tests ───────────────────────────────────────────────

test("expandIteration creates correct number of instances", () => {
  const graph = makeIterateGraph();
  const items = ["Chapter 1", "Chapter 2", "Chapter 3"];
  const result = expandIteration(graph, "draft-chapters", items, "Write about {{item}}");

  const instances = result.steps.filter((s) => s.parentStepId === "draft-chapters");
  assert.equal(instances.length, 3);
});

test("expandIteration instance IDs are deterministic and zero-padded", () => {
  const graph = makeIterateGraph();
  const items = ["A", "B", "C"];
  const result = expandIteration(graph, "draft-chapters", items, "p");

  const instanceIds = result.steps
    .filter((s) => s.parentStepId === "draft-chapters")
    .map((s) => s.id);

  assert.deepEqual(instanceIds, [
    "draft-chapters--001",
    "draft-chapters--002",
    "draft-chapters--003",
  ]);
});

test("expandIteration marks parent step as expanded", () => {
  const graph = makeIterateGraph();
  const result = expandIteration(graph, "draft-chapters", ["X"], "p");

  const parent = result.steps.find((s) => s.id === "draft-chapters");
  assert.equal(parent?.status, "expanded");
});

test("expandIteration rewrites downstream dependsOn", () => {
  const graph = makeIterateGraph();
  const items = ["A", "B", "C"];
  const result = expandIteration(graph, "draft-chapters", items, "p");

  const review = result.steps.find((s) => s.id === "review");
  assert.deepEqual(review?.dependsOn, [
    "draft-chapters--001",
    "draft-chapters--002",
    "draft-chapters--003",
  ]);
});

test("expandIteration copies parent dependsOn to instances", () => {
  const graph = makeIterateGraph();
  // Parent "draft-chapters" depends on "outline"
  const result = expandIteration(graph, "draft-chapters", ["A", "B"], "p");

  const instances = result.steps.filter((s) => s.parentStepId === "draft-chapters");
  for (const inst of instances) {
    assert.deepEqual(inst.dependsOn, ["outline"]);
  }
});

test("expandIteration instance prompts replace {{item}} placeholder", () => {
  const graph = makeIterateGraph();
  const result = expandIteration(
    graph,
    "draft-chapters",
    ["Chapter 1"],
    "Write about {{item}}, focusing on {{item}} details",
  );

  const instance = result.steps.find((s) => s.id === "draft-chapters--001");
  assert.equal(
    instance?.prompt,
    "Write about Chapter 1, focusing on Chapter 1 details",
  );
});

test("getNextPendingStep skips expanded steps", () => {
  const graph = makeIterateGraph();
  const expanded = expandIteration(graph, "draft-chapters", ["A", "B"], "p");

  // outline is complete, draft-chapters is expanded, instances are pending
  const next = getNextPendingStep(expanded);
  assert.equal(next?.id, "draft-chapters--001");
  // Confirm it's an instance, not the parent
  assert.equal(next?.parentStepId, "draft-chapters");
});

test("writeGraph/readGraph roundtrip preserves parentStepId and expanded status", () => {
  const dir = makeTmpDir();
  try {
    const graph = makeIterateGraph();
    const expanded = expandIteration(graph, "draft-chapters", ["A", "B"], "Write {{item}}");

    writeGraph(dir, expanded);
    const loaded = readGraph(dir);

    // Parent preserved
    const parent = loaded.steps.find((s) => s.id === "draft-chapters");
    assert.equal(parent?.status, "expanded");
    assert.equal(parent?.parentStepId, undefined);

    // Instance preserved
    const inst1 = loaded.steps.find((s) => s.id === "draft-chapters--001");
    assert.equal(inst1?.parentStepId, "draft-chapters");
    assert.equal(inst1?.status, "pending");
    assert.equal(inst1?.prompt, "Write A");

    const inst2 = loaded.steps.find((s) => s.id === "draft-chapters--002");
    assert.equal(inst2?.parentStepId, "draft-chapters");

    // Downstream deps rewritten
    const review = loaded.steps.find((s) => s.id === "review");
    assert.deepEqual(review?.dependsOn, [
      "draft-chapters--001",
      "draft-chapters--002",
    ]);

    // Steps without parentStepId don't gain one
    const outline = loaded.steps.find((s) => s.id === "outline");
    assert.equal(outline?.parentStepId, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("expandIteration throws on missing stepId", () => {
  const graph = makeIterateGraph();
  assert.throws(
    () => expandIteration(graph, "nonexistent", ["A"], "p"),
    { message: /step not found: nonexistent/ },
  );
});

test("expandIteration throws on non-pending step", () => {
  const graph = makeIterateGraph();
  // "outline" is already "complete"
  assert.throws(
    () => expandIteration(graph, "outline", ["A"], "p"),
    { message: /has status "complete", expected "pending"/ },
  );
});

// ─── Immutability test ───────────────────────────────────────────────────

test("expandIteration does not mutate input graph", () => {
  const graph = makeIterateGraph();
  const originalSteps = graph.steps.map((s) => ({ ...s, dependsOn: [...s.dependsOn] }));

  expandIteration(graph, "draft-chapters", ["A", "B"], "p");

  // Original graph should be unchanged
  assert.equal(graph.steps.length, 3);
  for (let i = 0; i < graph.steps.length; i++) {
    assert.deepEqual(graph.steps[i].id, originalSteps[i].id);
    assert.deepEqual(graph.steps[i].status, originalSteps[i].status);
    assert.deepEqual(graph.steps[i].dependsOn, originalSteps[i].dependsOn);
  }
});

/**
 * graph.ts — Pure data module for GRAPH.yaml workflow definitions.
 *
 * Provides types and functions for reading, writing, and querying the
 * step graph that drives CustomWorkflowEngine. Zero engine dependencies.
 *
 * GRAPH.yaml lives in a run directory and tracks step statuses
 * (pending → active → complete) with optional dependency edges.
 */

import { parse, stringify } from "yaml";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────

export interface GraphStep {
  /** Unique step identifier within the workflow. */
  id: string;
  /** Human-readable step title. */
  title: string;
  /** Current status: pending → active → complete. */
  status: "pending" | "active" | "complete";
  /** The prompt to dispatch for this step. */
  prompt: string;
  /** IDs of steps that must be "complete" before this step can run. */
  dependsOn: string[];
}

export interface WorkflowGraph {
  /** Ordered list of steps in the workflow. */
  steps: GraphStep[];
  /** Workflow metadata. */
  metadata: {
    name: string;
    createdAt: string;
  };
}

// ─── YAML schema mapping ─────────────────────────────────────────────────

const GRAPH_FILENAME = "GRAPH.yaml";

/**
 * Internal YAML shape — uses snake_case for YAML keys.
 * Converted to/from the camelCase TypeScript types on read/write.
 */
interface YamlStep {
  id: string;
  title: string;
  status: string;
  prompt: string;
  depends_on?: string[];
}

interface YamlGraph {
  steps: YamlStep[];
  metadata: { name: string; created_at: string };
}

// ─── Functions ───────────────────────────────────────────────────────────

/**
 * Read and parse GRAPH.yaml from a run directory.
 *
 * @param runDir — directory containing GRAPH.yaml
 * @returns Parsed workflow graph
 * @throws Error if file doesn't exist or YAML is malformed
 */
export function readGraph(runDir: string): WorkflowGraph {
  const filePath = join(runDir, GRAPH_FILENAME);
  if (!existsSync(filePath)) {
    throw new Error(`GRAPH.yaml not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  const yaml = parse(raw) as YamlGraph;

  if (!yaml?.steps || !Array.isArray(yaml.steps)) {
    throw new Error(`Invalid GRAPH.yaml: missing or invalid 'steps' array in ${filePath}`);
  }

  return {
    steps: yaml.steps.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status as GraphStep["status"],
      prompt: s.prompt,
      dependsOn: s.depends_on ?? [],
    })),
    metadata: {
      name: yaml.metadata?.name ?? "unnamed",
      createdAt: yaml.metadata?.created_at ?? new Date().toISOString(),
    },
  };
}

/**
 * Write a workflow graph to GRAPH.yaml in a run directory.
 * Creates the directory if it doesn't exist. Write is atomic (write + rename).
 *
 * @param runDir — directory to write GRAPH.yaml into
 * @param graph — the workflow graph to serialize
 */
export function writeGraph(runDir: string, graph: WorkflowGraph): void {
  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }

  const yamlData: YamlGraph = {
    steps: graph.steps.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      prompt: s.prompt,
      depends_on: s.dependsOn.length > 0 ? s.dependsOn : undefined,
    })) as YamlStep[],
    metadata: {
      name: graph.metadata.name,
      created_at: graph.metadata.createdAt,
    },
  };

  const filePath = join(runDir, GRAPH_FILENAME);
  const tmpPath = filePath + ".tmp";
  const content = stringify(yamlData);
  writeFileSync(tmpPath, content, "utf-8");
  // Atomic rename for crash safety
  renameSync(tmpPath, filePath);
}

/**
 * Get the next pending step whose dependencies are all complete.
 *
 * Returns the first step (in array order) with status "pending" where
 * every step in its `dependsOn` list has status "complete".
 *
 * @param graph — the workflow graph to query
 * @returns The next dispatchable step, or null if none available
 */
export function getNextPendingStep(graph: WorkflowGraph): GraphStep | null {
  const statusMap = new Map(graph.steps.map((s) => [s.id, s.status]));

  for (const step of graph.steps) {
    if (step.status !== "pending") continue;
    const depsComplete = step.dependsOn.every(
      (depId) => statusMap.get(depId) === "complete",
    );
    if (depsComplete) return step;
  }

  return null;
}

/**
 * Return a new graph with the specified step marked as "complete".
 * Immutable — does not mutate the input graph.
 *
 * @param graph — the current workflow graph
 * @param stepId — ID of the step to mark complete
 * @returns New graph with the step's status set to "complete"
 * @throws Error if stepId is not found in the graph
 */
export function markStepComplete(
  graph: WorkflowGraph,
  stepId: string,
): WorkflowGraph {
  const found = graph.steps.some((s) => s.id === stepId);
  if (!found) {
    throw new Error(`Step not found: ${stepId}`);
  }

  return {
    ...graph,
    steps: graph.steps.map((s) =>
      s.id === stepId ? { ...s, status: "complete" as const } : s,
    ),
  };
}

/**
 * CustomExecutionPolicy — stub execution policy for custom workflows.
 *
 * Implements ExecutionPolicy with neutral return values, parallel to
 * DevExecutionPolicy stubs. Real policy behavior (model selection,
 * verification, recovery) will be implemented in S05+.
 *
 * Created in S03.
 */

import type { ExecutionPolicy } from "./execution-policy.js";
import type { RecoveryAction, CloseoutResult } from "./engine-types.js";

export class CustomExecutionPolicy implements ExecutionPolicy {
  async prepareWorkspace(
    _basePath: string,
    _milestoneId: string,
  ): Promise<void> {
    // Stub: custom workflows don't require workspace preparation yet.
  }

  async selectModel(
    _unitType: string,
    _unitId: string,
    _context: { basePath: string },
  ): Promise<{ tier: string; modelDowngraded: boolean } | null> {
    // Stub: no model routing for custom workflows yet.
    return null;
  }

  async verify(
    _unitType: string,
    _unitId: string,
    _context: { basePath: string },
  ): Promise<"continue" | "retry" | "pause"> {
    // Stub: no verification pipeline for custom workflows yet.
    return "continue";
  }

  async recover(
    _unitType: string,
    _unitId: string,
    _context: { basePath: string },
  ): Promise<RecoveryAction> {
    // Stub: default recovery is retry.
    return { outcome: "retry" };
  }

  async closeout(
    _unitType: string,
    _unitId: string,
    _context: { basePath: string; startedAt: number },
  ): Promise<CloseoutResult> {
    // Stub: no commit/artifact handling for custom workflows yet.
    return { committed: false, artifacts: [] };
  }
}

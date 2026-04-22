/**
 * Deterministic job-ID derivation for BullMQ deduplication.
 *
 * Formula: sha256(missionId + "|" + stepId + "|" + inputHash)
 * where inputHash is the sha256 of the JSON-serialised job payload.
 *
 * BullMQ automatically makes an `add()` with a duplicate jobId a no-op
 * (when the job is still in waiting/active/delayed state), giving us
 * idempotent job submission for free.
 */

import { createHash } from 'crypto';

/**
 * Hash an arbitrary string value with SHA-256 and return hex.
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Build a deterministic BullMQ jobId.
 *
 * @param missionId   High-level mission/request identifier (e.g. UUID or slug).
 * @param stepId      Step within the mission (e.g. "execute-task", "squad-task").
 * @param inputData   The full job payload – serialised and hashed so that any
 *                    change in inputs produces a different jobId.
 */
export function buildJobId(
  missionId: string,
  stepId: string,
  inputData: Record<string, unknown>,
): string {
  const inputHash = sha256(JSON.stringify(inputData));
  return sha256(`${missionId}|${stepId}|${inputHash}`);
}

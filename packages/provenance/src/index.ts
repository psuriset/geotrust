/** Content-addressed evidence is deterministic and separate from hazard severity. */
import type {
  AnalysisResult,
  EvidenceRun,
  IngestedBundle,
  ValidationIssue,
} from '../../domain/src/types';
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(record)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
        .join(',') +
      '}'
    );
  }
  throw new Error('Evidence must contain only finite JSON values');
}
export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function createEvidence(
  input: IngestedBundle,
  result: AnalysisResult,
  issues: ValidationIssue[],
): Promise<EvidenceRun> {
  const inputs = await Promise.all(
    input.sources.map(async (source) => ({
      sourceId: source.id,
      sha256: await sha256(source.payload),
      publisher: source.publisher,
      license: source.license,
      capturedAt: source.capturedAt,
    })),
  );
  inputs.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const sortedIssues = [...issues].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const content = {
    schemaVersion: 1 as const,
    synthetic: true as const,
    inputs,
    result,
    issues: sortedIssues,
  };
  return { ...content, id: await sha256(content) };
}
export function evidenceLabel(run: EvidenceRun): string {
  return (
    'Synthetic evidence · ' +
    run.inputs.length +
    ' hashed inputs · ' +
    run.issues.length +
    ' validation issues. Checksums do not prove truth.'
  );
}

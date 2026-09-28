import type { compareEvidence, inventoryAge } from '../../changes/src/index';
import type { FeedSnapshot } from '../../storage/src/index';
import type { ZoneRecord } from '../../zones/src/index';
import type { ExposureRun } from '../../exposure/src/index';
export type Command =
  | { kind: 'analyze'; snapshots: FeedSnapshot[]; zones: ZoneRecord[]; asOf: string }
  | { kind: 'replay'; file: Blob }
  | { kind: 'compare'; left: Blob; right: Blob };
export interface EvidenceView {
  kind: 'evidence';
  inventoryAge: ReturnType<typeof inventoryAge>;
  sha256: string;
  asOf: string;
  inventoryCount: number;
  synthetic: boolean;
  counts: Record<string, number>;
  complete: boolean;
  limitations: string[];
  findingCount: number;
  details: string[];
  blob: Blob;
}
export type Comparison = Awaited<ReturnType<typeof compareEvidence>> & {
  eventChangeCount: number;
  assetChangeCount: number;
  findingChangeCount: number;
  blob: Blob;
};
export type Result = EvidenceView | Comparison;
export type Reply = { id: number } & (
  | { kind: 'progress'; phase: string }
  | { kind: 'result'; value: Result }
  | { kind: 'error'; message: string }
);
export type Finding = ExposureRun['findings'][number];

import type { FeedSnapshot } from '../../storage/src/index';
import type { ZoneRecord } from '../../zones/src/index';
import type { ExposureRun } from '../../exposure/src/index';
export type Command =
  | { kind: 'analyze'; snapshots: FeedSnapshot[]; zones: ZoneRecord[]; asOf: string }
  | { kind: 'replay'; file: Blob }
  | { kind: 'compare'; left: Blob; right: Blob };
export interface EvidenceView {
  kind: 'evidence';
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
export interface Comparison {
  kind: 'comparison';
  left: string;
  right: string;
  added: number;
  removed: number;
  unchanged: number;
  inventoryChanged: boolean;
  message: string;
}
export type Result = EvidenceView | Comparison;
export type Reply = { id: number } & (
  | { kind: 'progress'; phase: string }
  | { kind: 'result'; value: Result }
  | { kind: 'error'; message: string }
);
export type Finding = ExposureRun['findings'][number];

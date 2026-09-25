/** Shared contracts contain no I/O, UI, source parsing or analysis implementation. */
import type { Feature, LineString, Point, Polygon, MultiPolygon } from 'geojson';
export type Area = Polygon | MultiPolygon;
export interface SourceRecord {
  id: string;
  label: string;
  publisher: string;
  license: string;
  synthetic: true;
  capturedAt: string;
  payload: unknown;
}
export interface IngestedBundle {
  sources: SourceRecord[];
}
export interface Hazard {
  id: string;
  sourceId: string;
  kind: 'weather' | 'earthquake';
  title: string;
  geometry: Area | Point | null;
  observedAt: string;
  updatedAt: string;
  startsAt: string;
  expiresAt: string | null;
  status: 'actual' | 'test' | 'cancelled';
  geometryBasis: 'source' | 'missing';
  severity: string | null;
  magnitude: number | null;
  depthKm: number | null;
}
export interface Asset {
  id: string;
  sourceId: string;
  name: string;
  kind: 'hospital' | 'potential-shelter' | 'major-road';
  geometry: Point | LineString;
  operationalStatus: 'unknown';
}
export interface ValidationIssue {
  sourceId: string;
  recordId: string;
  reason: string;
}
export interface NormalizedBundle {
  hazards: Hazard[];
  assets: Asset[];
  issues: ValidationIssue[];
}
export interface Finding {
  id: string;
  hazardId: string;
  assetId: string;
  sourceIds: string[];
  kind: 'exposure' | 'proximity' | 'unknown';
  metricKm: number | null;
  reason: string;
}
export interface AnalysisResult {
  method: 'fixture-screen-v1';
  asOf: string;
  radiusKm: number;
  findings: Finding[];
  limitations: string[];
}
export interface EvidenceRun {
  schemaVersion: 1;
  id: string;
  synthetic: true;
  inputs: {
    sourceId: string;
    sha256: string;
    publisher: string;
    license: string;
    capturedAt: string;
  }[];
  result: AnalysisResult;
  issues: ValidationIssue[];
}
export type MapFeature = Feature<Point | LineString | Area>;
export interface DependencyEdge {
  from: string;
  to: string;
  kind: 'access' | 'power' | 'service';
  evidenceId: string;
  asOf: string;
  status: 'verified' | 'assumed';
}

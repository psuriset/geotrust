/** Ingestion owns acquisition only. Phase 1 deliberately provides no HTTP adapter. */
import nws from '../../../data/fixtures/nws.json';
import usgs from '../../../data/fixtures/usgs.json';
import assets from '../../../data/fixtures/assets.json';
import type { IngestedBundle, SourceRecord } from '../../domain/src/types';
export interface IngestionAdapter {
  load(): IngestedBundle;
}
export function createFixtureAdapter(maxInputBytes: number): IngestionAdapter {
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1)
    throw new Error('Invalid input limit');
  return {
    load() {
      const sources: SourceRecord[] = [
        { id: 'fixture-nws', label: 'Synthetic NWS-shaped alerts', payload: nws },
        { id: 'fixture-usgs', label: 'Synthetic USGS-shaped earthquakes', payload: usgs },
        { id: 'fixture-assets', label: 'Synthetic NC asset examples', payload: assets },
      ].map((source) => ({
        ...source,
        publisher: 'GeoTrust synthetic fixtures',
        license: 'MIT',
        synthetic: true,
        capturedAt: '2026-09-25T12:00:00Z',
      }));
      if (new TextEncoder().encode(JSON.stringify(sources)).byteLength > maxInputBytes) {
        throw new Error('Fixture bundle exceeds configured byte limit');
      }
      return structuredClone({ sources });
    },
  };
}

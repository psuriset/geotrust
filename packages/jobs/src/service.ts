import { sha256 } from '../../provenance/src/index';
import { inventorySchema } from '../../assets/src/schema';
import { createPreparedBundle, importBundle } from '../../bundles/src/index';
import { prepareExposure, countAssets, type PreparedExposure } from '../../exposure/src/index';
import type { Command, Result, EvidenceView, Finding } from './protocol';
type Bundle = Awaited<ReturnType<typeof importBundle>>;
/** This service runs only in a worker in production. No large JSON crosses back to the UI. */
export class AnalysisService {
  private prepared?: PreparedExposure;
  constructor(
    private loadInventory: () => Promise<unknown> = async () => {
      const response = await fetch(new URL('/data/nc-inventory.json', globalThis.location.origin), {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error('Run npm run data:prepare then rebuild to install the NC inventory.');
      const blob = await response.blob();
      if (blob.size > 128_000_000) throw new Error('Inventory exceeds 128 MB');
      return JSON.parse(await blob.text());
    },
  ) {}
  async run(command: Command, progress: (phase: string) => void): Promise<Result> {
    if (command.kind === 'compare') {
      progress('Verifying both saved snapshots');
      const left = await this.replay(command.left);
      const right = await this.replay(command.right);
      const key = (f: Finding) => JSON.stringify([f.eventId, f.assetId, f.kind, f.geometryBasis]);
      const before = new Set(left.result.findings.map(key));
      const after = new Set(right.result.findings.map(key));
      const unchanged = [...before].filter((id) => after.has(id)).length;
      return {
        kind: 'comparison',
        left: left.asOf,
        right: right.asOf,
        added: after.size - unchanged,
        removed: before.size - unchanged,
        unchanged,
        inventoryChanged: (await sha256(left.inventory)) !== (await sha256(right.inventory)),
        message:
          'Evidence match changes only; not observed damage, recovery or changed operations. Inventory revisions change record identities.',
      };
    }
    let bundle: Bundle;
    if (command.kind === 'replay') {
      progress('Verifying hashes and replaying analysis');
      bundle = await this.replay(command.file);
    } else {
      if (!this.prepared) {
        progress('Loading and validating local inventory');
        const inventory = inventorySchema.parse(await this.loadInventory());
        progress('Indexing inventory bounds');
        this.prepared = prepareExposure(inventory);
      }
      progress('Analyzing exposure and hashing evidence');
      bundle = await createPreparedBundle(
        this.prepared,
        command.snapshots,
        command.asOf,
        100,
        command.zones,
      );
    }
    progress('Encoding portable evidence');
    return this.view(bundle);
  }
  private async replay(file: Blob) {
    if (file.size > 128_000_000) throw new Error('Evidence bundle exceeds 128 MB');
    return importBundle(await file.text());
  }
  private view(bundle: Bundle): EvidenceView {
    const assets = new Map(bundle.inventory.assets.map((a) => [a.id, a]));
    const events = new Map(bundle.snapshots.flatMap((s) => s.events).map((e) => [e.id, e]));
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
    if (blob.size > 128_000_000)
      throw new Error('Combined evidence exceeds the 128 MB replay limit');
    return {
      kind: 'evidence',
      sha256: bundle.sha256,
      asOf: bundle.asOf,
      inventoryCount: bundle.inventory.assets.length,
      synthetic: bundle.inventory.synthetic,
      counts: countAssets(bundle.result.findings, bundle.inventory),
      complete: bundle.result.complete,
      limitations: bundle.result.limitations,
      findingCount: bundle.result.findings.length,
      details: bundle.result.findings.slice(0, 100).map((f) => {
        const asset = assets.get(f.assetId)!;
        return `${asset.properties.kind}: ${asset.properties.name ?? asset.id} · ${events.get(f.eventId)!.title} · ${f.kind} · ${f.geometryBasis}`;
      }),
      blob,
    };
  }
}

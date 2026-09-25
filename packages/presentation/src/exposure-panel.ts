import { createBundle, importBundle } from '../../bundles/src/index';
import type { Inventory } from '../../assets/src/schema';
import type { FeedSnapshot } from '../../storage/src/index';
import type { ZoneRecord } from '../../zones/src/index';
import { countAssets } from '../../exposure/src/index';
/** DOM-only integration boundary; imported bundles are replayed without touching live feed storage. */
export async function renderExposurePanel(
  container: HTMLElement,
  inventory: Inventory,
  snapshots: FeedSnapshot[],
  zones: ZoneRecord[],
  asOf: string,
) {
  const bundle = await createBundle(inventory, snapshots, asOf, 100, zones);
  const counts = countAssets(bundle.result.findings, inventory);
  const root = document.createElement('section');
  root.className = 'geotrust-panel';
  const heading = document.createElement('h3');
  heading.textContent = 'North Carolina exposure screening';
  root.append(heading);
  const summary = document.createElement('p');
  summary.textContent = `${inventory.synthetic ? 'SYNTHETIC INVENTORY · ' : ''}${bundle.result.complete ? 'Complete input coverage' : 'Partial / unknown coverage'} · ${inventory.assets.length} inventory records · ${bundle.result.findings.length} event–asset intersections. Potential shelters are not confirmed open. Proximity is not damage.`;
  root.append(summary);
  const list = document.createElement('ul');
  for (const [kind, count] of Object.entries(counts)) {
    const row = document.createElement('li');
    row.textContent = `${kind}: ${count} unique intersecting records`;
    list.append(row);
  }
  root.append(list);
  for (const limitation of bundle.result.limitations) {
    const text = document.createElement('p');
    text.textContent = limitation;
    root.append(text);
  }
  const details = document.createElement('details');
  const caption = document.createElement('summary');
  caption.textContent =
    'Inspect matched records (first 100 of ' + bundle.result.findings.length + ')';
  details.append(caption);
  const assetsById = new Map(inventory.assets.map((a) => [a.id, a]));
  const eventsById = new Map(snapshots.flatMap((s) => s.events).map((e) => [e.id, e]));
  for (const finding of bundle.result.findings.slice(0, 100)) {
    const row = document.createElement('p');
    const asset = assetsById.get(finding.assetId)!;
    const event = eventsById.get(finding.eventId)!;
    row.textContent = `${asset.properties.kind}: ${asset.properties.name ?? asset.id} · ${event.title} · ${finding.kind} · ${finding.geometryBasis}`;
    details.append(row);
  }
  root.append(details);
  const download = document.createElement('button');
  download.textContent = 'Export reproducible evidence bundle';
  download.onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'geotrust-evidence-' + bundle.sha256 + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  root.append(download);
  const label = document.createElement('label');
  label.textContent = 'Replay evidence bundle';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  label.append(input);
  root.append(label);
  const replay = document.createElement('p');
  root.append(replay);
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void file
      .text()
      .then(importBundle)
      .then((result) => {
        replay.textContent = `REPLAY · ${result.asOf} · ${result.result.findings.length} verified reproducible findings`;
      })
      .catch((error) => {
        replay.textContent = 'Replay failed: ' + String(error);
      });
  };
  container.append(root);
  return () => root.remove();
}

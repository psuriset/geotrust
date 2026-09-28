import { browserStorage, historyUsage } from '../../history/src/capacity';
import { reasonText } from '../../changes/src/index';
import { AnalysisClient, type JobClient } from '../../jobs/src/client';
import type { Command, EvidenceView, Result } from '../../jobs/src/protocol';
import { IndexedHistoryStore, type HistoryStore } from '../../history/src/index';
import type { FeedSnapshot } from '../../storage/src/index';
import type { ZoneRecord } from '../../zones/src/index';
/** Presentation never parses inventory or evidence JSON. Replay/history also work without live feeds. */
export function renderExposurePanel(
  container: HTMLElement,
  client: JobClient = new AnalysisClient(),
  history: HistoryStore = new IndexedHistoryStore(),
) {
  const root = document.createElement('section');
  root.className = 'geotrust-panel';
  const heading = document.createElement('h3');
  heading.textContent = 'North Carolina exposure screening';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Ready for analysis or offline replay';
  const evidence = document.createElement('div');
  const button = (text: string, action: () => void) => {
    const element = document.createElement('button');
    element.textContent = text;
    element.onclick = action;
    return element;
  };
  let alive = true;
  let generation = 0;
  let busy = false;
  let paused = false;
  let current: EvidenceView | undefined;
  let comparison: Extract<Result, { kind: 'comparison' }> | undefined;
  const comparisonDetails = document.createElement('div');
  const exportBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  let latest: Extract<Command, { kind: 'analyze' }> | undefined;
  const show = (value: Result, replay: boolean) => {
    if (value.kind === 'comparison') {
      comparison = value;
      comparisonDetails.replaceChildren();
      status.textContent = `COMPARE · ${value.left} → ${value.right} · ${value.added} added, ${value.removed} removed, ${value.unchanged} retained matches (${value.updated} changed distances). Inventory changed: ${value.inventoryChanged}. ${value.message}`;
      const lines = [
        `Earthquake screening radius: ${value.radiusKm.left} km → ${value.radiusKm.right} km.`,
        ...(value.reverseChronology
          ? ['Snapshot B predates A. Direction is A → B, not chronological change.']
          : []),
        ...value.coverage.map(
          (c) =>
            `${c.source} coverage: ${c.left.status}/${c.left.freshness} → ${c.right.status}/${c.right.freshness}`,
        ),
        `Event records changed: ${value.eventChangeCount}; asset records changed: ${value.assetChangeCount}; match details: ${value.findingChangeCount}. Display limited to 25 event/asset and 50 match rows; export includes all rows.`,
        ...value.eventChanges.map(
          (c) => `${c.change}: ${c.title} [${c.id}] · fields: ${c.fields.join(', ')}`,
        ),
        ...value.assetChanges.map(
          (c) => `${c.change}: ${c.name} [${c.id}] · fields: ${c.fields.join(', ')}`,
        ),
        ...value.findingChanges.map(
          (c) =>
            `${c.change}: ${c.eventTitle} → ${c.assetName} · ${c.reasons.map((r) => reasonText[r]).join(' ')}`,
        ),
      ];
      for (const line of lines) {
        const row = document.createElement('p');
        row.textContent = line;
        comparisonDetails.append(row);
      }
      exportComparison.disabled = false;
      return;
    }
    comparison = undefined;
    comparisonDetails.replaceChildren();
    exportComparison.disabled = true;
    current = value;
    evidence.replaceChildren();
    const text = document.createElement('p');
    text.textContent = `${replay ? 'REPLAY · ' : ''}${value.asOf} · ${value.synthetic ? 'SYNTHETIC INVENTORY · ' : ''}${value.complete ? 'Complete input coverage' : 'Partial / unknown coverage'} · NC inventory: ${value.inventoryCount} · ${value.findingCount} verified reproducible findings. Potential shelters are not confirmed open. Proximity is not damage.`;
    evidence.append(text);
    const age = document.createElement('p');
    const ageLabel =
      value.inventoryAge.state === 'review-due'
        ? 'Review overdue'
        : value.inventoryAge.state === 'future-capture'
          ? 'Capture date is in the future'
          : 'Recent capture; source freshness unverified';
    if (value.inventoryAge.state !== 'recent-capture') age.className = 'geotrust-inventory-warning';
    age.textContent = `Inventory review: ${ageLabel} · captured ${value.inventoryAge.capturedAt} · ${value.inventoryAge.daysAtAnalysis} days old at analysis; ${value.inventoryAge.daysAtReview} days old at review ${value.inventoryAge.checkedAt}. ${value.inventoryAge.message}`;
    evidence.append(age);
    for (const source of value.inventoryAge.sources) {
      const row = document.createElement('p');
      row.textContent = `${source.id} source vintage: ${source.vintage || 'Unknown'}`;
      evidence.append(row);
    }
    for (const line of [
      ...Object.entries(value.counts).map(
        ([kind, n]) => `${kind}: ${n} unique intersecting records`,
      ),
      ...value.limitations,
    ]) {
      const row = document.createElement('p');
      row.textContent = line;
      evidence.append(row);
    }
    const details = document.createElement('details');
    const caption = document.createElement('summary');
    caption.textContent = `Inspect matched records (first 100 of ${value.findingCount})`;
    details.append(caption);
    for (const line of value.details) {
      const row = document.createElement('p');
      row.textContent = line;
      details.append(row);
    }
    evidence.append(details);
    status.textContent = replay ? 'Offline replay verified' : 'Analysis complete';
    download.disabled = false;
    save.disabled = false;
  };
  const run = async (command: Command) => {
    if (!alive) return;
    paused = command.kind !== 'analyze';
    const token = ++generation;
    busy = true;
    cancel.disabled = false;
    status.textContent = 'Starting worker';
    try {
      const value = await client.run(command, (phase) => {
        if (alive && token === generation) status.textContent = phase;
      });
      if (alive && token === generation) {
        show(value, command.kind === 'replay');
        return value;
      }
    } catch (error) {
      if (alive && token === generation) status.textContent = String(error);
    } finally {
      if (token === generation) {
        busy = false;
        cancel.disabled = true;
      }
    }
  };
  const cancel = button('Cancel current work', () => {
    paused = true;
    client.cancel();
  });
  cancel.disabled = true;
  const analyze = button('Analyze latest inputs', () => {
    if (latest) void run(latest);
  });
  const reload = button('Reload inventory and analyze', () => {
    client.cancel();
    if (latest) void run(latest);
  });
  const download = button('Export reproducible evidence bundle', () => {
    if (!current) return;
    exportBlob(current.blob, 'geotrust-evidence-' + current.sha256 + '.json');
  });
  download.disabled = true;
  const exportComparison = button('Export comparison report', () => {
    if (comparison)
      exportBlob(
        comparison.blob,
        'geotrust-comparison-' +
          comparison.inputHashes.left.slice(0, 12) +
          '-' +
          comparison.inputHashes.right.slice(0, 12) +
          '.json',
      );
  });
  exportComparison.disabled = true;
  const localStatus = document.createElement('p');
  const action = (operation: () => Promise<void>) => {
    void operation().catch((error) => {
      if (alive) localStatus.textContent = 'Local history: ' + String(error);
    });
  };
  const save = button('Save snapshot locally', () =>
    action(async () => {
      if (!current) return;
      await history.save({
        sha256: current.sha256,
        asOf: current.asOf,
        savedAt: new Date().toISOString(),
        findingCount: current.findingCount,
        bytes: current.blob.size,
        blob: current.blob,
      });
      if (!alive) return;
      localStatus.textContent = 'Snapshot saved in this browser';
      await refreshHistory();
    }),
  );
  save.disabled = true;
  const label = document.createElement('label');
  label.textContent = 'Replay evidence bundle';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) {
      input.value = '';
      void run({ kind: 'replay', file });
    }
  };
  label.append(input);
  const left = document.createElement('select');
  left.setAttribute('aria-label', 'Saved snapshot A');
  const right = document.createElement('select');
  right.setAttribute('aria-label', 'Saved snapshot B');
  const refreshHistory = async () => {
    const records = await history.list();
    if (!alive) return;
    for (const select of [left, right]) {
      const selected = select.value;
      select.replaceChildren();
      for (const record of records) {
        const option = document.createElement('option');
        option.value = record.sha256;
        option.textContent = `${record.asOf} · ${record.findingCount} matches · ${(record.bytes / 1e6).toFixed(1)} MB · ${record.sha256.slice(0, 8)}`;
        select.append(option);
      }
      select.value = records.some((r) => r.sha256 === selected)
        ? selected
        : (records[0]?.sha256 ?? '');
    }
    const usage = historyUsage(records);
    localStatus.textContent = `${records.length} saved snapshots · ${usage.bytes} bytes (${(usage.bytes / 1e6).toFixed(1)} MB) used; ${(usage.remainingBytes / 1e6).toFixed(1)} MB and ${usage.remainingRecords} slots remaining · explicit saves only · maximum 10 / 256 MB. Browser storage can be cleared or evicted; export important evidence.`;
  };
  const replay = button('Replay saved snapshot A', () =>
    action(async () => {
      if (left.value) await run({ kind: 'replay', file: (await history.get(left.value)).blob });
    }),
  );
  const compare = button('Compare saved snapshots A and B', () =>
    action(async () => {
      const a = left.value,
        b = right.value;
      if (a && b) {
        const records = await Promise.all([history.get(a), history.get(b)]);
        await run({ kind: 'compare', left: records[0].blob, right: records[1].blob });
      }
    }),
  );
  const backup = button('Export verified saved snapshot A', () =>
    action(async () => {
      if (!left.value) return;
      const result = await run({ kind: 'replay', file: (await history.get(left.value)).blob });
      if (result?.kind === 'evidence')
        exportBlob(result.blob, 'geotrust-evidence-' + result.sha256 + '.json');
    }),
  );
  const browserStatus = document.createElement('p');
  const checkStorage = (persist: boolean) => {
    void browserStorage(persist).then((text) => {
      if (alive) browserStatus.textContent = text;
    });
  };
  const inspectStorage = button('Check browser storage', () => checkStorage(false));
  const persistStorage = button('Request persistent storage', () => checkStorage(true));
  const remove = button('Delete saved snapshot A', () =>
    action(async () => {
      if (left.value) {
        await history.remove(left.value);
        if (alive) await refreshHistory();
      }
    }),
  );
  root.append(
    heading,
    status,
    cancel,
    analyze,
    reload,
    comparisonDetails,
    exportComparison,
    evidence,
    download,
    save,
    label,
    left,
    right,
    replay,
    compare,
    backup,
    remove,
    localStatus,
    inspectStorage,
    persistStorage,
    browserStatus,
  );
  container.append(root);
  action(refreshHistory);
  return {
    update(snapshots: FeedSnapshot[], zones: ZoneRecord[], asOf: string) {
      latest = { kind: 'analyze', snapshots, zones, asOf };
      // Polling must not interrupt an interactive replay, comparison or a running analysis.
      if (!busy && !paused) void run(latest);
    },
    dispose() {
      alive = false;
      generation++;
      client.dispose();
      root.remove();
      void history.close().catch(() => {});
    },
  };
}

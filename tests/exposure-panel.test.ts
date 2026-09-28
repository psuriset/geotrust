import { expect, it, vi, afterEach } from 'vitest';
import { renderExposurePanel } from '../packages/presentation/src/exposure-panel';
import { AnalysisService } from '../packages/jobs/src/service';
import type { JobClient } from '../packages/jobs/src/client';
import type { HistoryStore, HistoryRecord } from '../packages/history/src/index';
import { inventory, feeds, at } from './phase3-fixtures';
afterEach(() => vi.restoreAllMocks());
function harness() {
  const data = inventory();
  data.assets[0]!.properties.name = '<script>bad</script>';
  const service = new AnalysisService(async () => data);
  const client: JobClient = {
    run: vi.fn((c, p) => service.run(c, p)),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  const records = new Map<string, HistoryRecord>();
  const history: HistoryStore = {
    list: vi.fn(async () =>
      [...records.values()].map(({ blob, ...r }) => {
        void blob;
        return r;
      }),
    ),
    get: vi.fn(async (id) => records.get(id)!),
    save: vi.fn(async (r) => {
      records.set(r.sha256, r);
    }),
    remove: vi.fn(async (id) => {
      records.delete(id);
    }),
    close: vi.fn(async () => {}),
  };
  const host = document.createElement('div');
  const panel = renderExposurePanel(host, client, history);
  const click = (name: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === name)!.click();
  return { host, panel, client, history, click, records, data };
}
it('renders safe worker summaries, exports blobs, saves/reloads/compares/deletes local snapshots and replays files', async () => {
  const h = harness();
  const snapshots = await feeds();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  h.click('Analyze latest inputs');
  h.click('Replay saved snapshot A');
  h.click('Compare saved snapshots A and B');
  h.click('Delete saved snapshot A');
  h.panel.update(snapshots, [], at);
  await vi.waitFor(() => expect(h.host.textContent).toContain('Partial / unknown'));
  expect(h.host.querySelector('script')).toBeNull();
  h.click('Export reproducible evidence bundle');
  h.click('Save snapshot locally');
  await vi.waitFor(() => expect(h.host.textContent).toContain('1 saved snapshots'));
  h.click('Replay saved snapshot A');
  await vi.waitFor(() => expect(h.host.textContent).toContain('REPLAY'));
  h.click('Compare saved snapshots A and B');
  await vi.waitFor(() => expect(h.host.textContent).toContain('COMPARE'));
  const input = h.host.querySelector('input')!;
  input.dispatchEvent(new Event('change'));
  Object.defineProperty(input, 'files', { configurable: true, value: [new Blob(['bad'])] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(h.host.textContent).toContain('SyntaxError'));
  Object.defineProperty(input, 'files', { value: [h.records.values().next().value!.blob] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(h.host.textContent).toContain('Offline replay verified'));
  h.click('Delete saved snapshot A');
  await vi.waitFor(() => expect(h.host.textContent).toContain('0 saved snapshots'));
  h.data.synthetic = false;
  snapshots[0]!.events = snapshots[0]!.events.filter((e) => e.geometry);
  h.panel.update(snapshots, [], at);
  h.click('Analyze latest inputs');
  await vi.waitFor(() => expect(h.host.textContent).toContain('Complete input'));
  h.click('Reload inventory and analyze');
  await vi.waitFor(() => expect(h.host.textContent).toContain('Analysis complete'));
  h.panel.dispose();
  expect(h.host.textContent).toBe('');
  expect(h.client.dispose).toHaveBeenCalled();
});
it('does not replace busy replay, cancels work, reports history errors and ignores late completion after disposal', async () => {
  const h = harness();
  let reject!: (error: Error) => void;
  let progress!: (phase: string) => void;
  vi.mocked(h.client.run).mockImplementation((_command, p) => {
    progress = p;
    return new Promise((_r, j) => {
      reject = j;
    });
  });
  h.panel.update([], [], at);
  h.panel.update([], [], at);
  expect(h.client.run).toHaveBeenCalledTimes(1);
  progress('Indexing');
  expect(h.host.textContent).toContain('Indexing');
  vi.mocked(h.client.cancel).mockImplementation(() => reject(new Error('Cancelled')));
  h.click('Cancel current work');
  await vi.waitFor(() => expect(h.host.textContent).toContain('Cancelled'));
  vi.mocked(h.history.list).mockRejectedValue(new Error('Quota'));
  h.panel.update([], [], at);
  h.panel.dispose();
  progress('late');
  reject(new Error('late'));
  await new Promise((r) => setTimeout(r, 0));
  expect(h.host.textContent).toBe('');
  const broken = harness();
  vi.mocked(broken.history.get).mockRejectedValue(new Error('Quota'));
  const option = document.createElement('option');
  option.value = 'x';
  broken.host.querySelector('select')!.append(option);
  broken.click('Replay saved snapshot A');
  await vi.waitFor(() => expect(broken.host.textContent).toContain('Local history: Error: Quota'));
  broken.panel.dispose();
});
it('does not restart a worker when a history read finishes after the panel is closed', async () => {
  const h = harness();
  let finish!: (record: HistoryRecord) => void;
  vi.mocked(h.history.get).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const option = document.createElement('option');
  option.value = 'saved';
  const select = h.host.querySelector('select')!;
  select.append(option);
  select.value = 'saved';
  h.click('Replay saved snapshot A');
  h.panel.dispose();
  finish({ blob: new Blob(['{}']) } as HistoryRecord);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(h.client.run).not.toHaveBeenCalled();
});

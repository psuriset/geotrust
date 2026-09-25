import { expect, it, vi, afterEach } from 'vitest';
import { renderExposurePanel } from '../packages/presentation/src/exposure-panel';
import { createBundle } from '../packages/bundles/src/index';
import { inventory, feeds, at } from './phase3-fixtures';
afterEach(() => vi.restoreAllMocks());
it('renders safe counts and exports a replayable evidence bundle; handles invalid file input', async () => {
  const host = document.createElement('div');
  const data = inventory();
  data.assets[0]!.properties.name = '<script>bad</script>';
  const snapshots = await feeds();
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const cleanup = await renderExposurePanel(host, data, snapshots, [], at);
  expect(host.textContent).toContain('Partial / unknown');
  expect(host.querySelector('script')).toBeNull();
  host.querySelector('button')!.click();
  expect(create).toHaveBeenCalled();
  const input = host.querySelector('input')!;
  input.dispatchEvent(new Event('change'));
  const bundle = await createBundle(data, snapshots, at);
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ text: async () => JSON.stringify(bundle) }],
  });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(host.textContent).toContain('REPLAY'));
  Object.defineProperty(input, 'files', { value: [{ text: async () => 'bad' }] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(host.textContent).toContain('Replay failed'));
  cleanup();
  expect(host.textContent).toBe('');
  const complete = await feeds();
  complete[0]!.events = complete[0]!.events.filter((e) => e.geometry);
  data.synthetic = false;
  data.assets.forEach((asset) => {
    asset.properties.name = null;
  });
  const done = await renderExposurePanel(host, data, complete, [], at);
  expect(host.textContent).toContain('Complete input');
  done();
});

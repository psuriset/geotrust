import { afterEach, expect, it, vi } from 'vitest';
import { AnalysisService } from '../packages/jobs/src/service';
import { AnalysisClient, createWorker } from '../packages/jobs/src/client';
import { createBundle } from '../packages/bundles/src/index';
import { analyzeExposure, prepareExposure } from '../packages/exposure/src/index';
import { inventory, feeds, at } from './phase3-fixtures';
import type { Reply } from '../packages/jobs/src/protocol';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('reuses the inventory index while preserving Phase 3 bundles and replay; compares evidence sets', async () => {
  const data = inventory();
  data.assets[0]!.properties.name = null;
  const snapshots = await feeds();
  const load = vi.fn(async () => data);
  const service = new AnalysisService(load);
  const phases = vi.fn();
  const command = { kind: 'analyze' as const, snapshots, zones: [], asOf: at };
  const first = await service.run(command, phases);
  const second = await service.run(command, phases);
  expect(load).toHaveBeenCalledTimes(1);
  const expected = await createBundle(data, snapshots, at);
  if (first.kind !== 'evidence' || second.kind !== 'evidence') throw new Error('Expected evidence');
  expect(JSON.parse(await first.blob.text())).toEqual(expected);
  expect(first.sha256).toBe(second.sha256);
  expect(await service.run({ kind: 'replay', file: first.blob }, phases)).toMatchObject({
    sha256: first.sha256,
  });
  const changed = await service.run({ ...command, snapshots: [] }, phases);
  if (changed.kind !== 'evidence') throw new Error('Expected evidence');
  expect(
    await service.run({ kind: 'compare', left: first.blob, right: changed.blob }, phases),
  ).toMatchObject({ added: 0, removed: first.findingCount, unchanged: 0, inventoryChanged: false });
  expect(
    await service.run({ kind: 'compare', left: first.blob, right: first.blob }, phases),
  ).toMatchObject({ unchanged: first.findingCount });
  await expect(
    service.run({ kind: 'replay', file: { size: 128_000_001 } as Blob }, phases),
  ).rejects.toThrow('128 MB');
  await expect(service.run({ kind: 'replay', file: new Blob(['bad']) }, phases)).rejects.toThrow();
  expect(() => analyzeExposure(data, snapshots, at, 100, [], prepareExposure(inventory()))).toThrow(
    'index mismatch',
  );
});
it('loads only local inventory and handles unavailable, oversized and malformed inventory', async () => {
  const command = { kind: 'analyze' as const, snapshots: [], zones: [], asOf: at };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(inventory()))),
  );
  expect(await new AnalysisService().run(command, vi.fn())).toMatchObject({ kind: 'evidence' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
  await expect(new AnalysisService().run(command, vi.fn())).rejects.toThrow('data:prepare');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => ({ size: 128_000_001 }) })),
  );
  await expect(new AnalysisService().run(command, vi.fn())).rejects.toThrow('128 MB');
  await expect(new AnalysisService(async () => ({})).run(command, vi.fn())).rejects.toThrow();
});
it('terminates cancellation, rejects superseded requests, ignores late replies and restarts after failures', async () => {
  const workers: {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage?: (e: { data: Reply }) => void;
    onerror?: () => void;
    onmessageerror?: () => void;
  }[] = [];
  const factory = vi.fn(() => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn() };
    workers.push(worker);
    return worker as unknown as Worker;
  });
  const client = new AnalysisClient(factory);
  const command = { kind: 'replay' as const, file: new Blob(['{}']) };
  const progress = vi.fn();
  const a = client.run(command, progress);
  const cancelled = expect(a).rejects.toThrow('Cancelled');
  const b = client.run(command, progress);
  await cancelled;
  workers[0]!.onerror!();
  workers[0]!.onmessageerror!();
  workers[0]!.onmessage!({ data: { id: 1, kind: 'progress', phase: 'late' } });
  workers[1]!.onmessage!({ data: { id: 2, kind: 'progress', phase: 'verify' } });
  expect(progress).toHaveBeenCalledExactlyOnceWith('verify');
  workers[1]!.onmessage!({ data: { id: 2, kind: 'error', message: 'bad input' } });
  await expect(b).rejects.toThrow('bad input');
  const c = client.run(command, progress);
  workers[1]!.onerror!();
  await expect(c).rejects.toThrow('worker failed');
  const d = client.run(command, progress);
  workers[2]!.onmessageerror!();
  await expect(d).rejects.toThrow('could not be read');
  const e = client.run(command, progress);
  workers[3]!.onmessage!({
    data: {
      id: 5,
      kind: 'result',
      value: {
        kind: 'comparison',
        left: at,
        right: at,
        added: 0,
        removed: 0,
        unchanged: 0,
        inventoryChanged: false,
        message: '',
      },
    },
  });
  await expect(e).resolves.toMatchObject({ kind: 'comparison' });
  workers[3]!.onmessage!({ data: { id: 5, kind: 'progress', phase: 'late' } });
  client.dispose();
  expect(workers[3]!.terminate).toHaveBeenCalled();
  const broken = new AnalysisClient(() => {
    throw new Error('CSP blocked');
  });
  await expect(broken.run(command, progress)).rejects.toThrow('CSP');
});
it('creates a self-contained blob worker and revokes the temporary URL even if construction fails', () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.stubGlobal(
    'Worker',
    class {
      constructor(public url: string) {}
    },
  );
  expect(createWorker()).toMatchObject({ url: 'blob:test' });
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new Error('blocked');
      }
    },
  );
  expect(createWorker).toThrow('blocked');
  expect(revoke).toHaveBeenCalledTimes(2);
});
it('worker entry forwards progress, result and failures with request identities', async () => {
  const post = vi.fn();
  vi.stubGlobal('postMessage', post);
  await import('../packages/jobs/src/worker-entry');
  const handler = globalThis.onmessage! as unknown as (e: MessageEvent) => Promise<void>;
  const bundle = await createBundle(inventory(), await feeds(), at);
  await handler({
    data: { id: 7, command: { kind: 'replay', file: new Blob([JSON.stringify(bundle)]) } },
  } as MessageEvent);
  expect(post.mock.calls.some(([r]) => r.id === 7 && r.kind === 'result')).toBe(true);
  await handler({
    data: { id: 8, command: { kind: 'replay', file: new Blob(['bad']) } },
  } as MessageEvent);
  expect(post.mock.calls.at(-1)![0]).toMatchObject({ id: 8, kind: 'error' });
});
it('rejects evidence exports larger than the replay contract permits', async () => {
  vi.stubGlobal(
    'Blob',
    class {
      size = 128_000_001;
    },
  );
  await expect(
    new AnalysisService(async () => inventory()).run(
      { kind: 'analyze', snapshots: [], zones: [], asOf: at },
      vi.fn(),
    ),
  ).rejects.toThrow('Combined evidence');
});

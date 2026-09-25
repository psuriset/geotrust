import { endpoints } from '../../geoevent/src/normalize';
import type { SourceId } from '../../geoevent/src/schema';
export class FeedHttpError extends Error {
  constructor(
    public status: number,
    public retryAt: number,
  ) {
    super('Upstream HTTP ' + status);
  }
}
export function retryDelay(value: string | null, now: number): number {
  if (value === null) return 0;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(value) || now) - now);
}
/** Exact upstream URLs only; redirects rejected, body bounded while streaming. */
export async function fetchFeed(
  source: SourceId,
  fetcher: typeof fetch = fetch,
  now = Date.now,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 10_000,
): Promise<{ payload: unknown; cacheMs: number }> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(endpoints[source], {
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'application/geo+json',
          'User-Agent': 'GeoTrust/0.2 (https://github.com/psuriset/geotrust)',
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new FeedHttpError(
          response.status,
          now() + retryDelay(response.headers.get('retry-after'), now()),
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing response body');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16_000_000) {
          await reader.cancel();
          throw new Error('Feed exceeds 16 MB');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
      const maxAge = Number(
        response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 0,
      );
      return { payload, cacheMs: Math.max(60_000, maxAge * 1000) };
    } catch (error) {
      const delay =
        error instanceof FeedHttpError
          ? Math.max(1000 * 2 ** attempt, error.retryAt - now())
          : 1000 * 2 ** attempt;
      if (
        attempt >= 2 ||
        (error instanceof FeedHttpError && error.status !== 429 && error.status < 500) ||
        delay > 10_000
      )
        throw error;
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
}

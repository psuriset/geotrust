import { AnalysisService } from './service';
import type { Command, Reply } from './protocol';
const service = new AnalysisService();
const port = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ id: number; command: Command }>) => void;
  postMessage: (reply: Reply) => void;
};
port.onmessage = async ({ data }) => {
  const { id, command } = data;
  try {
    const value = await service.run(command, (phase) =>
      port.postMessage({ id, kind: 'progress', phase }),
    );
    port.postMessage({ id, kind: 'result', value });
  } catch (error) {
    port.postMessage({ id, kind: 'error', message: String(error) });
  }
};

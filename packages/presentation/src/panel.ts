/** Safe DOM presentation: feed text is never interpreted as HTML. */
import type { EvidenceRun, NormalizedBundle } from '../../domain/src/types';
export function renderPanel(
  container: HTMLElement,
  bundle: NormalizedBundle,
  run: EvidenceRun,
  dependencyReason: string,
  evidenceText: string,
): () => void {
  const root = document.createElement('section');
  root.className = 'geotrust-panel';
  function text(tag: string, value: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = value;
    root.append(element);
    return element;
  }
  text('h2', 'GeoTrust');
  text('p', 'OFFLINE · SYNTHETIC FIXTURES · ' + run.result.asOf);
  text('h3', 'What is happening?');
  text(
    'p',
    bundle.hazards.length + ' fixture events loaded. No current conditions are represented.',
  );
  const list = document.createElement('ul');
  for (const hazard of bundle.hazards) {
    const item = document.createElement('li');
    item.textContent = hazard.title;
    list.append(item);
  }
  root.append(list);
  text('h3', 'Which infrastructure is exposed?');
  text(
    'p',
    'Hospitals and potential shelter locations only; shelter availability is unknown. Roads remain unanalyzed.',
  );
  const findings = document.createElement('ul');
  for (const finding of run.result.findings) {
    const item = document.createElement('li');
    item.textContent =
      finding.kind.toUpperCase() + ' · ' + finding.assetId + ' · ' + finding.reason;
    const detail = document.createElement('small');
    detail.textContent = 'Evidence: ' + finding.hazardId + ' | ' + finding.sourceIds.join(', ');
    item.append(detail);
    findings.append(item);
  }
  root.append(findings);
  text('h3', 'What could fail next?');
  text('p', dependencyReason);
  text('h3', 'How reliable is the evidence?');
  text('p', evidenceText);
  for (const input of run.inputs)
    text(
      'p',
      input.sourceId +
        ' · ' +
        input.publisher +
        ' · ' +
        input.license +
        ' · SHA-256 ' +
        input.sha256,
    );
  for (const issue of run.issues)
    text('p', 'Validation issue: ' + issue.recordId + ' · ' + issue.reason);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Export evidence JSON';
  button.addEventListener('click', download);
  function download(): void {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'geotrust-fixture-evidence.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  root.append(button);
  container.append(root);
  return () => {
    button.removeEventListener('click', download);
    root.remove();
  };
}

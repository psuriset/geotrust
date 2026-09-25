/** Dependency claims require explicit evidence; adjacency never creates an edge. */
import { z } from 'zod';
import type { DependencyEdge } from '../../domain/src/types';
const schema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(['access', 'power', 'service']),
    evidenceId: z.string().min(1),
    asOf: z.iso.datetime({ offset: true }),
    status: z.enum(['verified', 'assumed']),
  })
  .strict()
  .refine((edge) => edge.from !== edge.to, 'Self dependencies are invalid');
export function validateDependency(value: unknown): DependencyEdge {
  return schema.parse(value);
}
export function dependencyStatus(edges: readonly DependencyEdge[]): {
  available: false;
  reason: string;
  edgeCount: number;
} {
  return {
    available: false,
    edgeCount: edges.length,
    reason:
      edges.length === 0
        ? 'What could fail next? Unknown: no verified dependency data is loaded.'
        : 'Scenario propagation is deferred. Supplied edges are not a failure prediction.',
  };
}

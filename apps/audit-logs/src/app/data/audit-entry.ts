import { AtlasEventSource } from '@atlas/shared-contracts';

/**
 * One row of the audit trail. Rows come from two places: the mock backend
 * (`source: 'seed'`) and the cross-MFE bus, where the source is the remote
 * that published the event — which is what the "live" badge renders.
 */
export interface AuditEntry {
  /** Event id for bus-ingested rows, so replay + live delivery dedupe by id. */
  id: string;
  /** ISO-8601; the UI formats it and keeps the raw value in a title. */
  at: string;
  actor: string;
  action: string;
  target: string;
  /** Optional context, e.g. `viewer -> admin` for a role change. */
  detail?: string;
  source: 'seed' | AtlasEventSource;
}

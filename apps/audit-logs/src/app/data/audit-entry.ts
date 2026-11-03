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
  /** Optional context, e.g. `viewer to admin` for a role change. */
  detail?: string;
  source: 'seed' | AtlasEventSource;
}

/** Arrived over the bus while this page was open, rather than from the backend. */
export function isLive(entry: AuditEntry): boolean {
  return entry.source !== 'seed';
}

/**
 * `2026-07-08 09:12 UTC`. Converted rather than cut out of the string, so a value
 * written with an offset still reads as UTC and the label stays true. A value that
 * does not parse is shown as it came, since inventing a time would be worse.
 */
export function formatWhen(at: string): string {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return at;
  return `${new Date(time).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

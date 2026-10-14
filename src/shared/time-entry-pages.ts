import type { TimeEntry } from './types.js';

const PAGE_SIZE = 1000;
export const MAX_TIME_ENTRIES = 50000;
export type TimeEntryPageError = 'time_entry_limit' | 'result_incomplete';
type DbError = { code?: string; message?: string };
type PageResult = { data: unknown; error: DbError | null; count?: number | null };

/** Each page must use a fresh query with the same scope and a unique, stable order.
 * Exact counts and IDs detect incomplete pages and common concurrent changes;
 * separate requests are not a transactional snapshot of edits to existing rows. */
export async function readTimeEntryPages(
  loadPage: (from: number, to: number) => PromiseLike<PageResult>,
  fail: (error: DbError | null) => void,
  pageError: (code: TimeEntryPageError) => Error,
): Promise<TimeEntry[]> {
  const entries: TimeEntry[] = [], seen = new Set<string>();
  let expectedCount: number | undefined;
  for (let offset = 0; offset < MAX_TIME_ENTRIES; offset += PAGE_SIZE) {
    // Supabase range endpoints are inclusive.
    const { data, error, count } = await loadPage(offset, offset + PAGE_SIZE - 1);
    fail(error);
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw pageError('result_incomplete');
    if (count > MAX_TIME_ENTRIES) throw pageError('time_entry_limit');
    if (expectedCount !== undefined && count !== expectedCount)
      throw pageError('result_incomplete');
    expectedCount = count;
    if (!Array.isArray(data) || data.length !== Math.min(PAGE_SIZE, count - offset))
      throw pageError('result_incomplete');
    for (const entry of data) {
      if (!entry || typeof entry.id !== 'string' || seen.has(entry.id))
        throw pageError('result_incomplete');
      seen.add(entry.id);
    }
    entries.push(...data);
    if (entries.length === count) return entries;
  }
  throw pageError('time_entry_limit');
}

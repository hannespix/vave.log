import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createService } from '../src/shared/service.js';
import { createFinanceService } from '../src/shared/finance-service.js';
import type { TimeEntry } from '../src/shared/types.js';

const workspace = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const from = '2026-09-01', to = '2026-10-13';
const entry = (n: number): TimeEntry => ({
  id: `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`,
  workspace_id: workspace, project_id: project, user_id: user,
  work_date: '2026-10-01', created_at: '2026-10-01T12:00:00Z',
  minutes: 60, note: '', billable: true, status: 'approved', timer_id: null,
});
function response(data: unknown, count?: number) {
  return new Response(JSON.stringify(data), { status: 200, headers: {
    'content-type': 'application/json',
    ...(count === undefined ? {} : { 'content-range': `*/${count}` }),
  } });
}
type Page = { data: TimeEntry[]; count?: number; error?: boolean };
function backend(total: number, alter?: (page: Page, offset: number) => Page) {
  const requests: { url: URL; headers: Headers }[] = [];
  const client = createClient('https://test.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/time_entries')) {
        requests.push({ url, headers: new Headers(init?.headers) });
        const offset = Number(url.searchParams.get('offset') ?? 0);
        // Model the normal PostgREST server cap even if the request asks for more.
        const size = Math.min(1000, Number(url.searchParams.get('limit') ?? 1000), Math.max(0, total - offset));
        let page: Page = { data: Array.from({ length: size }, (_, n) => entry(offset + n)), count: total };
        if (alter) page = alter(page, offset);
        if (page.error) return new Response(JSON.stringify({ code: '42501', message: 'secret database details' }), { status: 403, headers: { 'content-type': 'application/json' } });
        return response(page.data, page.count);
      }
      if (url.pathname.endsWith('/projects')) return response([{ id: project, workspace_id: workspace, created_at: '2026-01-01T00:00:00Z' }], 1);
      if (url.pathname.endsWith('/workspaces')) return response({ currency: 'EUR' });
      if (url.pathname.endsWith('/finance_staff_rates')) return response([{ id: user, workspace_id: workspace, user_id: user, effective_from: '2026-01-01', cost_rate_minor: 6000, bill_rate_minor: 12000 }], 1);
      return response([], 0);
    } },
  });
  return { client, requests };
}

for (const mode of ['time', 'finance'] as const) {
  const read = (client: SupabaseClient) => mode === 'time'
    ? createService(client).listEntries(workspace, from, to)
    : createFinanceService(client).overview(workspace, from, to);
  const assertComplete = (result: Awaited<ReturnType<typeof read>>, count: number) => {
    if (Array.isArray(result)) {
      expect(result).toHaveLength(count);
      expect(new Set(result.map(row => row.id)).size).toBe(count);
      expect(result.reduce((sum, row) => sum + row.minutes, 0)).toBe(count * 60);
    } else {
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]).toMatchObject({ actual_minutes: count * 60, actual_labor_cost_minor: count * 6000, actual_billable_value_minor: count * 12000 });
    }
  };

  describe(`${mode} complete time-entry pagination`, () => {
    it('loads all 2,501 entries and uses the same workspace/date scope and deterministic order on every page', async () => {
      const { client, requests } = backend(2501);
      assertComplete(await read(client), 2501);
      expect(requests.map(r => r.url.searchParams.get('offset'))).toEqual(['0', '1000', '2000']);
      for (const { url, headers } of requests) {
        expect(url.searchParams.getAll('workspace_id')).toEqual([`eq.${workspace}`]);
        // Zeiten-Liste filtert auf den Zeitraum; die Finance-Übersicht lädt die
        // ganze Projekthistorie (M3-G) und filtert den Zeitraum im Speicher.
        expect(url.searchParams.getAll('work_date')).toEqual(mode === 'time' ? [`gte.${from}`, `lte.${to}`] : []);
        expect(url.searchParams.get('order')).toBe(mode === 'time' ? 'work_date.desc,created_at.desc,id.asc' : 'work_date.asc,id.asc');
        expect(url.searchParams.get('limit')).toBe('1000');
        expect(headers.get('prefer')).toContain('count=exact');
      }
    });

    it.each([0, 1000, 2000, 50000])('finishes exactly at the %i-entry boundary without an extra request', async count => {
      const { client, requests } = backend(count);
      assertComplete(await read(client), count);
      expect(requests).toHaveLength(Math.max(1, count / 1000));
    });

    it('rejects more than 50,000 matching entries before returning any data or totals', async () => {
      const { client, requests } = backend(50001);
      await expect(read(client)).rejects.toMatchObject({ code: 'time_entry_limit' });
      expect(requests).toHaveLength(1);
    });

    it('fails the whole read with the existing permission mapping if a later page is denied', async () => {
      const { client, requests } = backend(2501, (page, offset) => ({ ...page, error: offset > 0 }));
      await expect(read(client)).rejects.toMatchObject({ code: mode === 'time' ? '42501' : 'forbidden' });
      expect(requests).toHaveLength(2);
    });

    it('rejects a short server page rather than presenting partial totals', async () => {
      const { client } = backend(2501, page => ({ ...page, data: page.data.slice(0, 500) }));
      await expect(read(client)).rejects.toMatchObject({ code: 'result_incomplete' });
    });

    it('rejects missing exact counts rather than assuming a short page is complete', async () => {
      const { client } = backend(20, page => ({ ...page, count: undefined }));
      await expect(read(client)).rejects.toMatchObject({ code: 'result_incomplete' });
    });

    it('rejects changed counts between pages rather than returning a moving total', async () => {
      const { client } = backend(2501, (page, offset) => ({ ...page, count: offset > 0 ? 2502 : 2501 }));
      await expect(read(client)).rejects.toMatchObject({ code: 'result_incomplete' });
    });

    it('rejects duplicate entries crossing page boundaries', async () => {
      const { client } = backend(2501, (page, offset) => offset > 0 ? { ...page, data: [entry(0), ...page.data.slice(1)] } : page);
      await expect(read(client)).rejects.toMatchObject({ code: 'result_incomplete' });
    });
  });
}

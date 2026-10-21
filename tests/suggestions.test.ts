import { describe, expect, it } from 'vitest';
import { matchProject, overlapsBooked, roundQuarter } from '../src/shared/suggestions';

const projects = [
  { id: 'p1', code: 'VAV-001', name: 'Brand Experience', client: 'VAVE Studio', status: 'active' as const, tags: ['motion'] },
  { id: 'p2', code: 'VAV-002', name: 'Museum Erlebniswelt', client: 'Städtisches Museum', status: 'active' as const, tags: [] },
  { id: 'p3', code: 'OLD-9', name: 'Archiv Relaunch', client: 'Alt GmbH', status: 'archived' as const },
];
const tasks = [{ id: 't1', project_id: 'p2', title: 'Renderings Foyer', status: 'doing' as const }, { id: 't2', project_id: 'p2', title: 'Alte Skizzen', status: 'done' as const }];

describe('project matching for suggestions', () => {
  it('matches codes exactly and names, clients and tags tolerant of case and diacritics', () => {
    expect(matchProject('Jour fixe vav-002', projects, tasks)[0]).toMatchObject({ project_id: 'p2', score: 100, reasons: ['code'] });
    expect(matchProject('Museum Besprechung', projects)[0]).toMatchObject({ project_id: 'p2' });
    expect(matchProject('stadtisches museum', projects)[0]).toMatchObject({ project_id: 'p2', reasons: expect.arrayContaining(['client']) });
    expect(matchProject('Motion Reel Review', projects)[0]).toMatchObject({ project_id: 'p1', reasons: expect.arrayContaining(['tags']) });
    expect(matchProject('Brand Workshop', projects)[0].project_id).toBe('p1');
  });
  it('proposes an open task of the project and halves inactive projects', () => {
    const [best] = matchProject('Renderings für das Foyer', projects, tasks);
    expect(best).toMatchObject({ project_id: 'p2', task_id: 't1', task_title: 'Renderings Foyer' });
    expect(matchProject('Alte Skizzen', projects, tasks).some((m) => m.task_id === 't2')).toBe(false);
    const archived = matchProject('Archiv Relaunch', projects);
    expect(archived[0]).toMatchObject({ project_id: 'p3', score: 50 });
    expect(matchProject('   ', projects)).toEqual([]);
    expect(matchProject('zzz', projects)).toEqual([]);
    expect(matchProject('experience', projects, [], 1)).toHaveLength(1);
  });
  it('rounds to quarter hours and checks the daily cap', () => {
    expect(roundQuarter(7)).toBe(15); expect(roundQuarter(52)).toBe(45); expect(roundQuarter(53)).toBe(60);
    expect(overlapsBooked('2026-10-13', 120, [{ work_date: '2026-10-13', minutes: 1380 }, { work_date: '2026-10-12', minutes: 60 }])).toEqual({ booked: 1380, total: 1500, overDay: true });
    expect(overlapsBooked('2026-10-14', 120, [])).toEqual({ booked: 0, total: 120, overDay: false });
  });
});

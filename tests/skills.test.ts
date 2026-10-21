import { describe, expect, it } from 'vitest';
import { fitScore, normalizeTags, recommendAssignees, skillProfiles, taskCategories, type SkillTask } from '../src/shared/skills';

const projects = [{ id: 'p1', code: 'VAV-001', name: 'Brand', client: 'VAVE', tags: ['motion'] }, { id: 'p2', code: 'VAV-002', name: 'Museum', client: '', tags: [] }];
const task = (id: string, extra: Partial<SkillTask> = {}): SkillTask => ({ id, project_id: 'p1', title: id, status: 'done', assignee_id: 'a', due_date: '2026-10-10', estimated_minutes: 600, done_at: '2026-10-09T10:00:00Z', started_at: '2026-10-05T08:00:00Z', created_at: '2026-10-01T08:00:00Z', reopened_count: 0, ...extra });

describe('skill profiles', () => {
  it('normalises tags and derives categories from task, project or client', () => {
    expect(normalizeTags(' Motion, 3D ,motion,,Konzept ')).toEqual(['motion', '3d', 'konzept']);
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(taskCategories(task('t', { tags: ['3d'] }), projects[0])).toEqual(['3d']);
    expect(taskCategories(task('t'), projects[0])).toEqual(['motion']);
    expect(taskCategories(task('t', { project_id: 'p2' }), projects[1])).toEqual(['projekt:vav-002']);
    expect(taskCategories(task('t', { project_id: 'p2' }), { ...projects[1], client: 'Museum GmbH' })).toEqual(['kunde:museum gmbh']);
  });
  it('computes speed, punctuality, cycle time, reopenings and rating per person and category', () => {
    const tasks = [
      task('t1', { tags: ['motion'], rating: 5 }), // 480/600 = 0,8
      task('t2', { tags: ['motion'], rating: 4, done_at: '2026-10-12T10:00:00Z' }), // 900/600 = 1,5, zu spät
      task('t3', { tags: ['motion'], reopened_count: 1 }), // 600/600
      task('t4', { tags: ['konzept'], estimated_minutes: null }),
      task('t5', { tags: ['motion'], status: 'doing', done_at: null }),
      task('b1', { assignee_id: 'b', tags: ['motion'] }),
    ];
    const effort = new Map([['t1', 480], ['t2', 900], ['t3', 600], ['t4', 120], ['t5', 60], ['b1', 300]]);
    const [a, b] = skillProfiles(['a', 'b'], tasks, projects, effort);
    expect(a.totalDone).toBe(4); expect(a.totalMinutes).toBe(2160);
    const motion = a.categories.find((c) => c.category === 'motion')!;
    expect(motion).toMatchObject({ tasks: 4, done: 3, minutes: 2040, speed: 1, speedSamples: 3, onTime: 2 / 3, onTimeSamples: 3, cycleSamples: 3, reopened: 1, rating: 4.5, ratingSamples: 2, lastDone: '2026-10-12' });
    expect(motion.cycleDays).toBeCloseTo(4.08, 1);
    expect(a.categories.find((c) => c.category === 'konzept')).toMatchObject({ done: 1, speed: null, speedSamples: 0 });
    expect(b.categories[0]).toMatchObject({ category: 'motion', done: 1, speed: 0.5 });
    expect(fitScore(motion)).toBe(Math.round(((1.5 - 1) + 2 / 3 + (1 - 1 / 3) + 3.5 / 4) / 4 * 100));
    expect(fitScore(b.categories[0])).toBeNull(); // unter der Mindeststichprobe
    expect(fitScore(null)).toBeNull();
  });
  it('recommends by fit and free capacity and names its reasons', () => {
    const tasks = [...Array.from({ length: 4 }, (_, i) => task(`a${i}`, { tags: ['motion'], rating: 5 })), ...Array.from({ length: 3 }, (_, i) => task(`c${i}`, { assignee_id: 'c', tags: ['motion'], done_at: '2026-10-20T10:00:00Z', reopened_count: 1 }))];
    const effort = new Map(tasks.map((t) => [t.id, 600]));
    const profiles = skillProfiles(['a', 'b', 'c'], tasks, projects, effort);
    const list = recommendAssignees({ project_id: 'p1', tags: ['motion'] }, projects[0], profiles, new Map([['a', 600], ['b', 2400], ['c', 0]]));
    expect(list.map((r) => r.user_id)).toEqual(['a', 'c', 'b']);
    expect(list[0]).toMatchObject({ category: 'motion', freeMinutes: 600 });
    expect(list[0].fit).toBeGreaterThan(list[1].fit);
    expect(list[0].reasons).toEqual(['4×motion', 'speed:1.00', 'ontime:100', 'rating:5.0']);
    expect(list[2]).toMatchObject({ fit: 0, stats: null, freeMinutes: 2400 }); // nur freie Kapazität
    expect(recommendAssignees({ project_id: 'p2' }, projects[1], profiles, new Map())).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { assignLanes, barFor, dateAt, dayIndex, daysBetween, dragSpan, freeName, mondayOf, monthSegments, snapDays, spanBetween, timelineRange, weekStarts } from '../src/shared/timeline';

describe('timeline window', () => {
  it('starts on a Monday two weeks before today and spans whole weeks', () => {
    const range = timelineRange('2026-11-19', 13); // Donnerstag
    expect(range).toEqual({ from: '2026-11-02', to: '2027-01-31', days: 91 });
    expect(mondayOf('2026-11-22')).toBe('2026-11-16'); // Sonntag gehört zur Woche davor
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    expect(timelineRange('2026-11-19', 13, 4).from).toBe('2026-11-30');
    expect(timelineRange('2026-11-19', 26, -4, 0).from).toBe('2026-10-19');
    expect(dayIndex(range, '2026-11-19')).toBe(17);
    expect(dateAt(range, 17)).toBe('2026-11-19');
    expect(daysBetween('2026-12-28', '2027-01-04')).toBe(7);
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2); // über die Zeitumstellung
    expect(weekStarts(range)).toHaveLength(13);
    expect(weekStarts(range)[1]).toBe('2026-11-09');
  });
  it('splits the window into months', () => {
    const months = monthSegments(timelineRange('2026-11-19', 13));
    expect(months.map((m) => [m.key, m.days])).toEqual([['2026-11', 29], ['2026-12', 31], ['2027-01', 31]]);
    expect(months.reduce((a, m) => a + m.days, 0)).toBe(91);
  });
});

describe('bars', () => {
  const range = timelineRange('2026-11-19', 13);
  it('places a span as a share of the window and clips it at the edges', () => {
    expect(barFor(range, { starts_on: '2026-11-02', ends_on: '2026-11-08' })).toEqual({ left: 0, width: 7 / 91, cutLeft: false, cutRight: false });
    expect(barFor(range, { starts_on: '2026-10-20', ends_on: '2026-11-08' })).toEqual({ left: 0, width: 7 / 91, cutLeft: true, cutRight: false });
    expect(barFor(range, { starts_on: '2027-01-25', ends_on: '2027-03-01' })).toMatchObject({ width: 7 / 91, cutRight: true });
    expect(barFor(range, { starts_on: '2026-11-19', ends_on: '2026-11-19' })?.width).toBeCloseTo(1 / 91);
    expect(barFor(range, { starts_on: '2026-09-01', ends_on: '2026-11-01' })).toBeNull();
    expect(barFor(range, { starts_on: '2027-02-01', ends_on: '2027-02-10' })).toBeNull();
  });
  it('moves and resizes by whole days and never inverts a span', () => {
    const span = { starts_on: '2026-11-10', ends_on: '2026-11-20' };
    expect(dragSpan(span, 'move', 5)).toEqual({ starts_on: '2026-11-15', ends_on: '2026-11-25' });
    expect(dragSpan(span, 'move', -40)).toEqual({ starts_on: '2026-10-01', ends_on: '2026-10-11' });
    expect(dragSpan(span, 'start', 3)).toEqual({ starts_on: '2026-11-13', ends_on: '2026-11-20' });
    expect(dragSpan(span, 'start', 30)).toEqual({ starts_on: '2026-11-20', ends_on: '2026-11-20' });
    expect(dragSpan(span, 'end', -30)).toEqual({ starts_on: '2026-11-10', ends_on: '2026-11-10' });
    expect(dragSpan(span, 'end', 14)).toEqual({ starts_on: '2026-11-10', ends_on: '2026-12-04' });
    // Die Länge bleibt beim Verschieben auch am Rand des erlaubten Zeitraums erhalten.
    expect(dragSpan({ starts_on: '2100-12-20', ends_on: '2100-12-30' }, 'move', 30)).toEqual({ starts_on: '2100-12-21', ends_on: '2100-12-31' });
    expect(dragSpan({ starts_on: '2000-01-05', ends_on: '2000-01-09' }, 'move', -30)).toEqual({ starts_on: '2000-01-01', ends_on: '2000-01-05' });
  });
  it('draws a new span in either direction and snaps coarse views to weeks', () => {
    expect(spanBetween(range, 10, 3)).toEqual({ starts_on: '2026-11-05', ends_on: '2026-11-12' });
    expect(spanBetween(range, -5, 200)).toEqual({ starts_on: '2026-11-02', ends_on: '2027-01-31' });
    expect(snapDays(3.4, 1)).toBe(3);
    expect(snapDays(3.4, 7)).toBe(0);
    expect(snapDays(4.2, 7)).toBe(7);
    expect(snapDays(-11, 7)).toBe(-14);
  });
  it('stacks overlapping phases into lanes and reuses a lane once it is free', () => {
    const items = [
      { id: 'a', starts_on: '2026-11-01', ends_on: '2026-11-10' },
      { id: 'b', starts_on: '2026-11-05', ends_on: '2026-11-20' },
      { id: 'c', starts_on: '2026-11-11', ends_on: '2026-11-30' },
      { id: 'd', starts_on: '2026-11-10', ends_on: '2026-11-12' },
    ];
    const { lanes, count } = assignLanes(items);
    expect(Object.fromEntries(lanes)).toEqual({ a: 0, b: 1, d: 2, c: 0 });
    expect(count).toBe(3);
    expect(assignLanes([]).count).toBe(1);
    // Aneinandergrenzende Phasen teilen sich eine Spur.
    expect(assignLanes([{ id: 'x', starts_on: '2026-11-01', ends_on: '2026-11-07' }, { id: 'y', starts_on: '2026-11-08', ends_on: '2026-11-14' }]).count).toBe(1);
  });
  it('finds a free phase name', () => {
    expect(freeName('Neue Phase', [])).toBe('Neue Phase');
    expect(freeName('Neue Phase', ['neue phase ', 'Neue Phase 2'])).toBe('Neue Phase 3');
  });
});

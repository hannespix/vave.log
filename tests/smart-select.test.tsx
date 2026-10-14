import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SmartSelect, readOptions, matchesOption } from '../src/web/smart-select';

describe('searchable selects', () => {
 it('searches words across names and metadata, tolerating accents and Chinese', () => {
  const [option] = readOptions(<option value="u1" data-detail="Designer · 上海" data-group="Shanghai" data-keywords="jose@example.test">José Müller</option>);
  expect(matchesOption(option,'jose shanghai')).toBe(true);
  expect(matchesOption(option,'上海')).toBe(true);
  expect(matchesOption(option,'jose@example')).toBe(true);
  expect(matchesOption(option,'Berlin')).toBe(false);
 });
 it('preserves disabled historical values, groups and escaped labels', () => {
  const options=readOptions(<><option value="">None</option><optgroup label="People"><option disabled value="u">{'<Former>'}</option></optgroup></>);
  expect(options.map(o=>[o.value,o.label,o.disabled,o.group])).toEqual([['','None',false,''],['u','<Former>',true,'People']]);
  const html=renderToStaticMarkup(<SmartSelect name="person" defaultValue="u"><option value="u">{'<Former>'}</option></SmartSelect>);
  expect(html).toContain('value="u" selected=""');expect(html).toContain('&lt;Former&gt;');expect(html).toContain('role="combobox"');
 });
 it('retains native form constraints and a disabled empty placeholder', () => {
  const html=renderToStaticMarkup(<SmartSelect name="project" required defaultValue=""><option value="" disabled>Choose project</option><option value="p">Project</option></SmartSelect>);
  expect(html).toContain('required=""');expect(html).toContain('aria-hidden="true"');expect(html).toContain('name="project"');
 });
});

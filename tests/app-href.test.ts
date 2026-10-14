import { describe, expect, it } from 'vitest';
import { appHref, appPath } from '../src/web/helpers';

// The app runs at '/' on the server deployments and under a base path on a
// GitHub Pages project site; appHref/appPath must produce working URLs in both.
describe('appHref', () => {
  it('keeps root deployments unchanged', () => {
    expect(appHref('?reset=1', 'https://vave-log.example.com')).toBe('https://vave-log.example.com/?reset=1');
    expect(appHref('api/mcp', 'https://vave-log.example.com')).toBe('https://vave-log.example.com/api/mcp');
  });
  it('preserves a base path in the app URL', () => {
    expect(appHref('?reset=1', 'https://owner.github.io/vave.log')).toBe('https://owner.github.io/vave.log/?reset=1');
    expect(appHref('api/mcp', 'https://owner.github.io/vave.log')).toBe('https://owner.github.io/vave.log/api/mcp');
    expect(appHref('/oauth/consent', 'https://owner.github.io/vave.log')).toBe('https://owner.github.io/vave.log/oauth/consent');
  });
  it('tolerates trailing slashes and leading slashes alike', () => {
    expect(appHref('/?reset=1', 'https://owner.github.io/vave.log/')).toBe('https://owner.github.io/vave.log/?reset=1');
    expect(appHref('', 'https://owner.github.io/vave.log///')).toBe('https://owner.github.io/vave.log/');
  });
});

describe('appPath', () => {
  it('joins against the build base URL without doubling slashes', () => {
    const base = import.meta.env.BASE_URL;
    expect(appPath()).toBe(base);
    expect(appPath('oauth/consent')).toBe(`${base}oauth/consent`);
    expect(appPath('/oauth/consent')).toBe(`${base}oauth/consent`);
  });
});

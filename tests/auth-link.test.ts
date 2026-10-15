import { describe, expect, it } from 'vitest';
import { parseAuthLink, stripAuthLink } from '../src/web/helpers';

describe('parseAuthLink', () => {
  it('reads token-hash links from the email templates', () => {
    expect(parseAuthLink('?token_hash=pkce_abc&type=signup', '')).toMatchObject({ tokenHash: 'pkce_abc', type: 'signup', reset: false, errorCode: '' });
    expect(parseAuthLink('?reset=1&token_hash=xyz&type=recovery', '')).toMatchObject({ tokenHash: 'xyz', type: 'recovery', reset: true });
  });
  it('reads Supabase error redirects from query or hash, as sent to the Site URL', () => {
    const url = '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=';
    expect(parseAuthLink(url, hash)).toMatchObject({ errorCode: 'otp_expired', errorDescription: 'Email link is invalid or has expired', tokenHash: '' });
    expect(parseAuthLink('', hash)).toMatchObject({ errorCode: 'otp_expired' });
  });
  it('rejects unknown types and caps lengths', () => {
    expect(parseAuthLink('?token_hash=abc&type=evil', '').type).toBe('');
    expect(parseAuthLink(`?token_hash=${'a'.repeat(400)}&type=magiclink`, '').tokenHash).toHaveLength(200);
    expect(parseAuthLink(`?error_code=${'x'.repeat(100)}`, '').errorCode).toHaveLength(80);
  });
});

describe('stripAuthLink', () => {
  it('removes token, type and error parameters but keeps reset and the workflow hash', () => {
    expect(stripAuthLink('?token_hash=abc&type=signup', '')).toBe('/');
    expect(stripAuthLink('?reset=1&token_hash=abc&type=recovery', '')).toBe('/?reset=1');
    expect(stripAuthLink('?error=access_denied&error_code=otp_expired&error_description=x', '#error=access_denied&error_code=otp_expired')).toBe('/');
    expect(stripAuthLink('?token_hash=abc&type=signup', '#w=ws-1&view=time')).toBe('/#w=ws-1&view=time');
    expect(stripAuthLink('', '#access_token=secret&type=signup')).toBe('/');
  });
});

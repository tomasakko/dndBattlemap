import { booleanPref, localPref, stringPref } from './local-pref';

describe('localPref', () => {
  beforeEach(() => localStorage.clear());

  it('falls back when nothing is stored', () => {
    expect(localPref('k', [1]).read()).toEqual([1]);
  });

  it('round-trips JSON', () => {
    const pref = localPref<string[]>('k', []);
    pref.write(['a']);
    expect(pref.read()).toEqual(['a']);
  });

  it('falls back on unreadable values', () => {
    localStorage.setItem('k', '{not json');
    expect(localPref('k', 'fallback').read()).toBe('fallback');
  });

  it('stores booleans as text', () => {
    const pref = booleanPref('b', true);
    pref.write(false);
    expect(localStorage.getItem('b')).toBe('false');
    expect(pref.read()).toBe(false);
  });

  it('only accepts allowed strings', () => {
    localStorage.setItem('s', 'pink');
    expect(stringPref('s', 'grey', ['grey', 'blue']).read()).toBe('grey');
  });
});

import { describe, expect, it } from 'vitest';

import { parseNavLocation } from './useNavLocation';

describe('parseNavLocation', () => {
  it('defaults to the pinned homepage', () => {
    expect(parseNavLocation(null)).toEqual({ kind: 'home' });
    expect(parseNavLocation('')).toEqual({ kind: 'home' });
    expect(parseNavLocation('{')).toEqual({ kind: 'home' });
  });

  it('restores a remembered folder', () => {
    expect(parseNavLocation(JSON.stringify({ kind: 'folder', categoryId: 12 }))).toEqual({
      kind: 'folder',
      categoryId: 12,
    });
  });

  it('rejects invalid folder ids', () => {
    expect(parseNavLocation(JSON.stringify({ kind: 'folder', categoryId: 0 }))).toEqual({
      kind: 'home',
    });
    expect(parseNavLocation(JSON.stringify({ kind: 'folder', categoryId: 1.5 }))).toEqual({
      kind: 'home',
    });
  });
});

import { Stage, endLink, parseStage, presentStage } from './stage';

const world: Stage = { app: 'worldmap', mapId: null, mode: 'shared' };
const battle: Stage = { app: 'battlemap', mapId: 'b1', mode: 'shared' };
const link: Stage = { app: 'battlemap', mapId: 'b2', mode: 'linked' };

describe('stage', () => {
  it('shows one thing at a time', () => {
    const state = presentStage({ current: world, beforeLink: null }, battle);
    expect(state.current).toEqual(battle);
  });

  it('returns to what was shown before a link', () => {
    const linked = presentStage({ current: world, beforeLink: null }, link);
    expect(endLink(linked)).toEqual({ current: world, beforeLink: null });
  });

  it('keeps the original stage when one link follows another', () => {
    const first = presentStage({ current: world, beforeLink: null }, link);
    const second = presentStage(first, { ...link, mapId: 'b3' });
    expect(endLink(second).current).toEqual(world);
  });

  it('forgets the link history when something is shared normally', () => {
    const linked = presentStage({ current: world, beforeLink: null }, link);
    const shared = presentStage(linked, battle);
    expect(endLink(shared).current).toEqual(battle);
  });

  it('only accepts well-formed stages', () => {
    expect(parseStage(battle)).toEqual(battle);
    expect(parseStage({ app: 'battlemap', mapId: 3, mode: 'shared' })).toBeNull();
    expect(parseStage({ app: 'battlemap', mapId: null, mode: 'whatever' })).toBeNull();
    expect(parseStage(null)).toBeNull();
  });
});

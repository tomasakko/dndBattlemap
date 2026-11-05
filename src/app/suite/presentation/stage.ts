/**
 * What the players currently see. There is exactly one stage, so "players see one app at a time"
 * holds by construction instead of by each app switching the others off.
 */
export interface Stage {
  /** Suite app id, e.g. "battlemap". */
  readonly app: string;
  /** Which of the app's maps; null means "whatever the DM has open in that app". */
  readonly mapId: string | null;
  /**
   * "shared": the DM chose to show it. "linked": opened from a world map marker for a quick look,
   * so the app shows a player-safe version (nothing revealed, no initiative) and the link ends as
   * soon as the DM moves on.
   */
  readonly mode: 'shared' | 'linked';
}

export const STAGE_CHANNEL = 'dnd-player-stage';
export const STAGE_PROTOCOL = 1;
export const PLAYER_PATH = '/player';

export function sameStage(a: Stage | null, b: Stage | null): boolean {
  return a === b || (!!a && !!b && a.app === b.app && a.mapId === b.mapId && a.mode === b.mode);
}

/** Checks a stage read from storage, a project file or another window. */
export function parseStage(value: unknown): Stage | null {
  const data = value as Partial<Stage> | null;
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.app !== 'string' ||
    !data.app ||
    !(data.mapId === null || typeof data.mapId === 'string') ||
    (data.mode !== 'shared' && data.mode !== 'linked')
  ) {
    return null;
  }
  return { app: data.app, mapId: data.mapId, mode: data.mode };
}

/**
 * The stage's history rule: a link remembers what was shown before it, so ending the link returns
 * the players there. Pure, so the rule can be tested on its own.
 */
export interface StageState {
  readonly current: Stage | null;
  /** What was shown before the current link, if the current stage is a link. */
  readonly beforeLink: Stage | null;
}

export function presentStage(state: StageState, next: Stage | null): StageState {
  if (next?.mode === 'linked') {
    return {
      current: next,
      beforeLink: state.current?.mode === 'linked' ? state.beforeLink : state.current,
    };
  }
  return { current: next, beforeLink: null };
}

export function endLink(state: StageState): StageState {
  return state.current?.mode === 'linked' ? { current: state.beforeLink, beforeLink: null } : state;
}

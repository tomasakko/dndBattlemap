import { Service, computed, inject, signal } from '@angular/core';
import { CreatureService } from '../../../shared/creatures/creature.service';
import type { Statblock } from '../../../shared/creatures/statblock';
import { newId } from '../../../shared/util/id';

export type Side = 'player' | 'enemy';

export interface Combatant {
  id: string;
  playerId?: string;
  name: string;
  initiative: number;
  type: string;
  side: Side;
  /** DM edits to this creature's statblock. Without it, the creature type's default is used. DM-only. */
  stats?: Statblock;
  /** Current hit points. Undefined means full health. DM-only; players only learn whether the creature is down. */
  hp?: number;
  /** Sent to the player screen only: at 0 hit points. */
  down?: boolean;
}

export interface InitiativeState {
  combatants: Combatant[];
  activeId: string | null;
}

type Message =
  | { type: 'request' }
  | { type: 'state'; combatants: Combatant[]; activeId: string | null; shared: boolean };

const CHANNEL_NAME = 'dnd-initiative';

/** Initiative order. Same host/viewer split as the battlemap: the DM screen owns it, the player screen mirrors it. */
@Service()
export class InitiativeService {
  readonly combatants = signal<Combatant[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly shared = signal(false);

  /** Highest initiative first. The sort is stable, so ties keep the order they were added in. */
  readonly ordered = computed(() => [...this.combatants()].sort((a, b) => b.initiative - a.initiative));

  private readonly creatures = inject(CreatureService);
  private channel?: BroadcastChannel;
  private onChange?: () => void;

  startHost(): void {
    this.open((message) => {
      if (message.type === 'request') {
        this.broadcast();
      }
    });
  }

  startViewer(): void {
    this.open((message) => {
      if (message.type === 'state') {
        this.combatants.set(message.combatants);
        this.activeId.set(message.activeId);
        this.shared.set(message.shared);
      }
    });
    this.channel?.postMessage({ type: 'request' } satisfies Message);
  }

  setChangeHandler(handler: () => void): void {
    this.onChange = handler;
  }

  setShared(shared: boolean): void {
    this.shared.set(shared);
    this.commit();
  }

  add(name: string, initiative: number, type: string, side: Side): void {
    const combatant: Combatant = { id: newId(), name, initiative, type, side };
    this.combatants.update((list) => [...list, combatant]);
    this.commit();
  }

  addPlayer(playerId: string, name: string, initiative: number): void {
    if (this.combatants().some((combatant) => combatant.playerId === playerId)) {
      return;
    }
    const combatant: Combatant = {
      id: newId(),
      playerId,
      name,
      initiative,
      type: 'Character',
      side: 'player',
    };
    this.combatants.update((list) => [...list, combatant]);
    this.commit();
  }

  setStats(id: string, stats: Statblock | undefined): void {
    this.combatants.update((list) => list.map((c) => (c.id === id ? { ...c, stats } : c)));
    this.commit();
  }

  /** Maximum hit points from the (possibly edited) statblock. 0 when no hit points are filled in. */
  maxHp(combatant: Combatant): number {
    return combatant.stats?.hitPoints ?? this.creatures.findById(combatant.type)?.statblock.hitPoints ?? 0;
  }

  currentHp(combatant: Combatant): number {
    const max = this.maxHp(combatant);
    return Math.min(Math.max(combatant.hp ?? max, 0), max);
  }

  setHp(id: string, hp: number): void {
    this.combatants.update((list) => list.map((c) => (c.id === id ? { ...c, hp } : c)));
    this.commit();
  }

  remove(id: string): void {
    if (this.activeId() === id) {
      this.activeId.set(this.neighbourOf(id, 1));
    }
    this.combatants.update((list) => list.filter((c) => c.id !== id));
    this.commit();
  }

  clear(): void {
    this.combatants.set([]);
    this.activeId.set(null);
    this.commit();
  }

  setActive(id: string): void {
    this.activeId.set(id);
    this.commit();
  }

  /** Stops the fight but keeps everyone listed, so the same order can be started again. */
  endCombat(): void {
    this.activeId.set(null);
    this.commit();
  }

  next(): void {
    this.step(1);
  }

  previous(): void {
    this.step(-1);
  }

  private step(direction: 1 | -1): void {
    const active = this.activeId();
    const order = this.ordered();
    if (order.length === 0) {
      return;
    }
    this.activeId.set(active ? this.neighbourOf(active, direction) : order[direction === 1 ? 0 : order.length - 1].id);
    this.commit();
  }

  /** The combatant `direction` places away from `id` in turn order, wrapping around. */
  private neighbourOf(id: string, direction: 1 | -1): string | null {
    const order = this.ordered();
    const index = order.findIndex((c) => c.id === id);
    if (order.length <= 1 || index < 0) {
      return null;
    }
    return order[(index + direction + order.length) % order.length].id;
  }

  /** The initiative order and custom combatants as saved to a file. */
  exportState(): InitiativeState {
    return { combatants: this.combatants(), activeId: this.activeId() };
  }

  /** Replaces the initiative with the given saved state. Throws if it isn't valid. */
  importState(saved: unknown, shared = false): void {
    const data = saved as { combatants?: unknown; activeId?: unknown } | null;
    if (!data || !Array.isArray(data.combatants)) {
      throw new Error('No initiative in file');
    }
    const combatants = (data.combatants as Combatant[]).map((c) => {
      if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.initiative !== 'number') {
        throw new Error('Invalid combatant data');
      }
      return { ...c, side: c.side ?? 'enemy' };
    });
    this.combatants.set(combatants);
    this.activeId.set(combatants.some((c) => c.id === data.activeId) ? (data.activeId as string) : null);
    this.shared.set(shared);
    this.commit();
  }

  loadState(saved: InitiativeState | undefined, shared: boolean): void {
    this.combatants.set(saved?.combatants ?? []);
    this.activeId.set(saved?.activeId ?? null);
    this.shared.set(shared);
  }

  publish(): void {
    this.broadcast();
  }

  private commit(): void {
    this.broadcast();
    this.onChange?.();
  }

  private broadcast(): void {
    this.channel?.postMessage({
      type: 'state',
      combatants: this.combatants().map(({ stats: _stats, hp: _hp, ...rest }) => ({
        ...rest,
        down: this.maxHp(rest) > 0 && this.currentHp({ ...rest, hp: _hp, stats: _stats }) === 0,
      })),
      activeId: this.activeId(),
      shared: this.shared(),
    } satisfies Message);
  }

  private open(onMessage: (message: Message) => void): void {
    this.channel?.close();
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event: MessageEvent<Message>) => onMessage(event.data);
  }
}

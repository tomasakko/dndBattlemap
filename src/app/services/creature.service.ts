import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject, signal } from '@angular/core';
import type { Statblock } from '../models/statblock';

export interface Creature {
  id: string;
  label: string;
  image?: string;
  statblock: Statblock;
}

@Service()
export class CreatureService {
  private readonly platformId = inject(PLATFORM_ID);
  readonly types = signal<readonly Creature[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadMonsterManual();
    }
  }

  findById(id: string): Creature | undefined {
    return this.types().find((creature) => creature.id === id);
  }

  private async loadMonsterManual(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await fetch('assets/creatures/bestiary-mm.json');
      if (!response.ok) {
        throw new Error(`Bestiary request failed with status ${response.status}`);
      }
      const data = (await response.json()) as { monster?: unknown };
      const monsters = Array.isArray(data.monster) ? data.monster.map((monster) => this.toCreature(monster)) : [];
      if (monsters.length === 0) {
        throw new Error('The bestiary did not contain any creatures');
      }
      this.types.set(this.sort(monsters));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The bestiary could not be loaded');
    } finally {
      this.loading.set(false);
    }
  }

  private toCreature(value: unknown): Creature {
    const monster = value as MonsterData;
    const source = monster.source ?? 'MM';
    const label = monster.name ?? 'Unnamed creature';
    return {
      id: `${source}-${slugify(label)}`,
      label,
      image: monster.hasToken ? tokenUrl(source, label) : undefined,
      statblock: {
        name: label,
        size: (monster.size ?? []).map(sizeLabel).join(', '),
        type: typeLabel(monster.type),
        alignment: (monster.alignment ?? []).map(alignmentLabel).join(' '),
        armorClass: armorClass(monster.ac),
        armorNote: armorNote(monster.ac),
        hitPoints: monster.hp?.average ?? 0,
        hitDice: monster.hp?.formula ?? '',
        speed: movementValues(monster.speed),
        abilities: {
          str: monster.str ?? 0,
          dex: monster.dex ?? 0,
          con: monster.con ?? 0,
          int: monster.int ?? 0,
          wis: monster.wis ?? 0,
          cha: monster.cha ?? 0,
        },
        skills: skillText(monster),
        senses: sensesText(monster),
        languages: (monster.languages ?? []).join(', '),
        traits: entries(monster.trait),
        actions: [
          ...entries(monster.action),
          ...entries(monster.bonus),
          ...entries(monster.reaction),
          ...entries(monster.legendary),
          ...entries(monster.mythic),
        ],
      },
    };
  }

  private sort(creatures: readonly Creature[]): readonly Creature[] {
    return [...creatures].sort((a, b) => a.label.localeCompare(b.label));
  }
}

function tokenUrl(source: string, name: string): string {
  return `https://5e.tools/img/bestiary/tokens/${encodeURIComponent(source)}/${encodeURIComponent(name)}.webp`;
}

interface MonsterData {
  hasToken?: boolean;
  name?: string;
  source?: string;
  size?: string[];
  type?: string | { type?: string; tags?: string[] };
  alignment?: string[];
  ac?: (number | { ac?: number; from?: string[] })[];
  hp?: { average?: number; formula?: string };
  speed?: Record<string, number | { number?: number; condition?: string }>;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  skill?: Record<string, string>;
  passive?: number;
  senses?: string[];
  languages?: string[];
  trait?: MonsterEntry[];
  action?: MonsterEntry[];
  bonus?: MonsterEntry[];
  reaction?: MonsterEntry[];
  legendary?: MonsterEntry[];
  mythic?: MonsterEntry[];
}

interface MonsterEntry {
  name?: string;
  entries?: unknown[];
}

const ALIGNMENTS: Record<string, string> = {
  L: 'Lawful',
  N: 'Neutral',
  C: 'Chaotic',
  G: 'Good',
  E: 'Evil',
  U: 'Unaligned',
  A: 'Any alignment',
};

const SIZES: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sizeLabel(value: string): string {
  return SIZES[value] ?? value;
}

function alignmentLabel(value: string): string {
  return ALIGNMENTS[value] ?? value;
}

function typeLabel(value: MonsterData['type']): string {
  if (typeof value === 'string') {
    return value;
  }
  return value?.type ? `${value.type}${value.tags?.length ? ` (${value.tags.join(', ')})` : ''}` : '';
}

function armorClass(value: MonsterData['ac']): number {
  const first = value?.[0];
  return typeof first === 'number' ? first : first?.ac ?? 0;
}

function armorNote(value: MonsterData['ac']): string {
  const first = value?.[0];
  return typeof first === 'object' ? first.from?.map(cleanText).join(', ') ?? '' : '';
}

function movementValues(value: MonsterData['speed']): Statblock['speed'] {
  const speed = { walk: '', fly: '', swim: '', burrow: '', climb: '' };
  for (const movement of Object.keys(speed) as (keyof typeof speed)[]) {
    const raw = value?.[movement];
    if (typeof raw === 'number') {
      speed[movement] = `${raw} ft.`;
    } else if (raw) {
      speed[movement] = `${raw.number ?? 0} ft.${raw.condition ? ` ${cleanText(raw.condition)}` : ''}`;
    }
  }
  return speed;
}

function skillText(monster: MonsterData): string {
  const skills = Object.entries(monster.skill ?? {}).map(([name, value]) => `${name} ${value}`);
  if (monster.passive !== undefined) {
    skills.push(`Passive Perception ${monster.passive}`);
  }
  return skills.join('; ');
}

function sensesText(monster: MonsterData): string {
  return monster.senses?.length ? monster.senses.map(cleanText).join(', ') : '';
}

function entries(values: MonsterEntry[] | undefined): { name: string; description: string }[] {
  return (values ?? []).map((entry) => ({
    name: cleanText(entry.name ?? ''),
    description: (entry.entries ?? []).map(entryText).join('\n\n'),
  }));
}

function entryText(value: unknown): string {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  if (Array.isArray(value)) {
    return value.map(entryText).join('\n');
  }
  if (value && typeof value === 'object' && 'entries' in value) {
    return entryText((value as { entries: unknown[] }).entries);
  }
  return '';
}

function cleanText(value: string): string {
  return value
    .replace(/\{@[^}]+\}/g, (tag) => {
      const parts = tag.slice(2, -1).split('|');
      if (parts.length > 2 && parts[1] === '') {
        return parts[2];
      }
      return parts[0].replace(/^\S+\s*/, '');
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export interface StatEntry {
  name: string;
  description: string;
}

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const MOVEMENTS = ['walk', 'fly', 'swim', 'burrow', 'climb'] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** The shape of the JSON files in `creatures/`. */
export interface Statblock {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: number;
  armorNote: string;
  hitPoints: number;
  hitDice: string;
  speed: Record<Movement, string>;
  abilities: Record<Ability, number>;
  skills: string;
  senses: string;
  languages: string;
  traits: StatEntry[];
  actions: StatEntry[];
}

export function abilityModifier(score: number): string {
  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

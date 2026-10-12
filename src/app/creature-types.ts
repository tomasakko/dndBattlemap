import bugbear from '../assets/creatures/bugbear.json';
import goblin from '../assets/creatures/goblin.json';
import hobgoblin from '../assets/creatures/hobgoblin.json';
import human from '../assets/creatures/human.json';
import owlbear from '../assets/creatures/owlbear.json';
import { Statblock } from './statblock';
import grick from '../assets/creatures/grick.json';

export interface CreatureType {
  id: string;
  label: string;
  /** Image shown in the initiative bar. Types without one fall back to a generic person icon. */
  image?: string;
  /** Default statblock, loaded from creatures/<id>.json. */
  statblock: Statblock;
}

const UNSORTED_CREATURE_TYPES: readonly CreatureType[] = [
  { id: 'human', label: 'Human', image: 'assets/icons/human.svg', statblock: human },
  { id: 'goblin', label: 'Goblin', image: 'assets/icons/goblin.svg', statblock: goblin },
  { id: 'bugbear', label: 'Bugbear', image: 'assets/icons/bugbear.svg', statblock: bugbear },
  { id: 'hobgoblin', label: 'Hobgoblin', image: 'assets/icons/hobgoblin.svg', statblock: hobgoblin },
  { id: 'owlbear', label: 'Owlbear', image: 'assets/icons/owlbear.svg', statblock: owlbear },
  { id: 'grick', label: 'Grick', image: 'assets/icons/grick.svg', statblock: grick },
];

/** Always alphabetical by label, so new types can be added anywhere above. */
export const CREATURE_TYPES: readonly CreatureType[] = [...UNSORTED_CREATURE_TYPES].sort((a, b) =>
  a.label.localeCompare(b.label),
);

export function creatureType(id: string): CreatureType | undefined {
  return CREATURE_TYPES.find((type) => type.id === id);
}

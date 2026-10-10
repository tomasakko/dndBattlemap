import bugbear from './creatures/bugbear.json';
import goblin from './creatures/goblin.json';
import hobgoblin from './creatures/hobgoblin.json';
import human from './creatures/human.json';
import owlbear from './creatures/owlbear.json';
import { Statblock } from './statblock';
import grick from './creatures/grick.json'

export interface CreatureType {
  id: string;
  label: string;
  /** Image shown in the initiative bar. Types without one fall back to a generic person icon. */
  image?: string;
  /** Default statblock, loaded from creatures/<id>.json. */
  statblock: Statblock;
}

const UNSORTED_CREATURE_TYPES: readonly CreatureType[] = [
  { id: 'human', label: 'Human', statblock: human },
  { id: 'goblin', label: 'Goblin', statblock: goblin },
  { id: 'bugbear', label: 'Bugbear', statblock: bugbear },
  { id: 'hobgoblin', label: 'Hobgoblin', statblock: hobgoblin },
  { id: 'owlbear', label: 'Owlbear', statblock: owlbear },
  { id: 'grick', label: 'Grick', statblock: grick}

];

/** Always alphabetical by label, so new types can be added anywhere above. */
export const CREATURE_TYPES: readonly CreatureType[] = [...UNSORTED_CREATURE_TYPES].sort((a, b) =>
  a.label.localeCompare(b.label),
);

export function creatureType(id: string): CreatureType | undefined {
  return CREATURE_TYPES.find((type) => type.id === id);
}

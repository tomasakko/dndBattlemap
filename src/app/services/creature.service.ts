import { Service } from '@angular/core';
import bugbear from '../../assets/creatures/bugbear.json';
import goblin from '../../assets/creatures/goblin.json';
import grick from '../../assets/creatures/grick.json';
import hobgoblin from '../../assets/creatures/hobgoblin.json';
import human from '../../assets/creatures/human.json';
import owlbear from '../../assets/creatures/owlbear.json';
import type { Statblock } from '../models/statblock';

export interface Creature {
  id: string;
  label: string;
  image?: string;
  statblock: Statblock;
}

const CREATURE_DATA: readonly Creature[] = [
  { id: 'human', label: 'Human', image: 'assets/icons/human.svg', statblock: human },
  { id: 'goblin', label: 'Goblin', image: 'assets/icons/goblin.svg', statblock: goblin },
  { id: 'bugbear', label: 'Bugbear', image: 'assets/icons/bugbear.svg', statblock: bugbear },
  { id: 'hobgoblin', label: 'Hobgoblin', image: 'assets/icons/hobgoblin.svg', statblock: hobgoblin },
  { id: 'owlbear', label: 'Owlbear', image: 'assets/icons/owlbear.svg', statblock: owlbear },
  { id: 'grick', label: 'Grick', image: 'assets/icons/grick.svg', statblock: grick },
];

@Service()
export class CreatureService {
  readonly types: readonly Creature[] = [...CREATURE_DATA].sort((a, b) => a.label.localeCompare(b.label));

  findById(id: string): Creature | undefined {
    return this.types.find((creature) => creature.id === id);
  }
}

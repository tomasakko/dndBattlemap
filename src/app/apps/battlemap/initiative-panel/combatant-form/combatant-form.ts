import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InitiativeService, Side } from '../../services/initiative.service';
import { CreatureService } from '../../services/creature.service';

@Component({
  selector: 'app-combatant-form',
  imports: [ReactiveFormsModule],
  templateUrl: './combatant-form.html',
  styleUrl: './combatant-form.css',
  host: {
    '(window:pointermove)': 'repositionOpenTypeMenu()',
    '(window:resize)': 'repositionOpenTypeMenu()',
    '(window:scroll)': 'repositionOpenTypeMenu()',
  },
})
export class CombatantForm {
  private readonly initiative = inject(InitiativeService);
  private readonly creatures = inject(CreatureService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly types = this.creatures.types;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: [''],
    initiative: [null as number | null, [Validators.required]],
    type: [''],
    side: ['enemy' as Side],
  });
  protected readonly error = signal('');
  protected readonly creaturesLoading = this.creatures.loading;
  protected readonly creaturesError = this.creatures.error;
  protected readonly typeOpen = signal(false);
  protected readonly typeIndex = signal(0);
  protected readonly typeMenuPosition = signal({ top: 0, left: 0, width: 0 });
  private readonly typeFilter = signal('');
  protected readonly typeText = signal('');
  protected readonly filteredTypes = computed(() => {
    const query = this.typeFilter().trim().toLowerCase();
    if (!query) {
      return this.types();
    }
    const matches = this.types().filter((type) => type.label.toLowerCase().includes(query));
    return [
      ...matches.filter((type) => type.label.toLowerCase().startsWith(query)),
      ...matches.filter((type) => !type.label.toLowerCase().startsWith(query)),
    ];
  });

  protected openTypes(event: Event): void {
    this.positionTypeMenu(event.target as HTMLInputElement);
    this.typeFilter.set('');
    this.typeIndex.set(0);
    this.typeOpen.set(true);
    (event.target as HTMLInputElement).select();
  }

  protected searchTypes(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    this.positionTypeMenu(input);
    this.typeText.set(value);
    this.typeFilter.set(value);
    this.typeIndex.set(0);
    this.typeOpen.set(true);
  }

  protected onTypeKey(event: KeyboardEvent): void {
    const count = this.filteredTypes().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        this.typeOpen.set(true);
        if (count > 0) {
          this.typeIndex.update(
            (index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count,
          );
        }
        break;
      }
      case 'Enter':
        if (this.typeOpen()) {
          event.preventDefault();
          const choice = this.filteredTypes()[this.typeIndex()];
          if (choice) {
            this.pickType(choice.id);
          }
        }
        break;
      case 'Escape':
        this.closeTypes();
        break;
    }
  }

  protected pickType(id: string): void {
    this.form.controls.type.setValue(id);
    this.typeText.set(this.creatures.findById(id)?.label ?? '');
    this.typeOpen.set(false);
  }

  protected closeTypes(): void {
    this.typeText.set(this.creatures.findById(this.form.controls.type.value)?.label ?? '');
    this.typeOpen.set(false);
  }

  private positionTypeMenu(input: HTMLInputElement): void {
    const bounds = input.getBoundingClientRect();
    this.typeMenuPosition.set({
      top: bounds.bottom + 2,
      left: bounds.left,
      width: bounds.width,
    });
  }

  protected repositionOpenTypeMenu(): void {
    if (!this.typeOpen()) {
      return;
    }
    const input = this.host.nativeElement.querySelector<HTMLInputElement>('#type-input');
    if (input) {
      this.positionTypeMenu(input);
    }
  }

  protected add(): void {
    const { name, initiative, type, side } = this.form.getRawValue();
    const autoName = side === 'enemy' && !name.trim();
    const missing = [
      name.trim() || autoName ? '' : 'a name',
      type ? '' : 'a creature',
      initiative === null ? 'an initiative' : '',
    ].filter(Boolean);
    if (missing.length > 0) {
      this.error.set('Please enter ' + missing.join(' and ') + '.');
      return;
    }
    this.error.set('');
    this.initiative.add(
      autoName ? this.numberedName(type) : name.trim(),
      Math.round(initiative!),
      type,
      side,
    );
    this.form.patchValue({ name: '', initiative: null });
    this.form.markAsUntouched();
  }

  private numberedName(type: string): string {
    const label = this.creatures.findById(type)?.label ?? type;
    const pattern = new RegExp(
      '^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$',
      'i',
    );
    const highest = this.initiative
      .combatants()
      .reduce((max, combatant) => Math.max(max, Number(pattern.exec(combatant.name)?.[1] ?? 0)), 0);
    return `${label} ${highest + 1}`;
  }
}

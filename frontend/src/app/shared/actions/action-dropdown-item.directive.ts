import { Directive, HostBinding, Input } from '@angular/core';

@Directive({
  selector: 'button[appActionDropdownItem]',
  standalone: true,
  host: {
    type: 'button',
    role: 'menuitem',
  },
})
export class ActionDropdownItemDirective {
  @Input() danger = false;

  /** Quando true, insere divisor visual acima do item (ex.: antes de ação destrutiva). */
  @Input() dividerBefore = false;

  @HostBinding('class.action-dropdown__item')
  readonly itemClass = true;

  @HostBinding('class.action-dropdown__item--danger')
  get dangerClass(): boolean {
    return this.danger;
  }
}

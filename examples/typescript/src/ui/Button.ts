import { getCurrentUser } from '../services/auth';
import { capitalize } from '../utils/helpers';

export class Button {
  private label: string;

  constructor(label: string) {
    this.label = capitalize(label);
  }

  render(): string {
    const user = getCurrentUser();
    return `<button>${this.label} (${user?.name})</button>`;
  }
}

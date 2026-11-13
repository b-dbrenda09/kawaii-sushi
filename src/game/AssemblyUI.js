import { PREPARED_NAMES } from './RecipeSystem.js';

export class AssemblyUI {
  constructor(container) {
    this.element = document.createElement('aside');
    this.element.className = 'assembly-panel';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Montagem de sushi');
    this.title = document.createElement('strong');
    this.sequence = document.createElement('p');
    this.next = document.createElement('p');
    this.cancel = document.createElement('div');
    this.progress = document.createElement('progress');
    this.progress.max = 1;
    this.progress.setAttribute('aria-label', 'Progresso para cancelar a montagem');
    this.cancel.append('Segure R por 1 segundo para cancelar', this.progress);
    this.element.append(this.title, this.sequence, this.next, this.cancel);
    container.appendChild(this.element);
  }

  update(system, selected, carrySystem = system.carrySystem) {
    this.element.hidden = !selected || system.station.fireState === 'burning';
    if (this.element.hidden) return;
    const { possible, next } = system.analysis;
    const ready = system.state === 'READY';
    const sequence = system.sequence;
    this.title.textContent = ready ? `${system.dish.recipeName} pronto!`
      : possible.length === 1 ? possible[0].name : 'Montagem de sushi';
    this.sequence.textContent = ready ? '✓ Montagem completa' : sequence.length
      ? `Montagem: ${sequence.map((state) => PREPARED_NAMES[state]).join(' + ')}` : 'Prato livre';
    const lengths = [...new Set(possible.map((recipe) => recipe.sequence.length))].sort();
    this.next.textContent = ready ? 'Libere as mãos para retirar o sushi.'
      : `Próximo: ${next.map((state) => PREPARED_NAMES[state]).join(' ou ')} • ${sequence.length}/${lengths.join('–')} etapas`;
    this.cancel.hidden = system.state !== 'ASSEMBLING' || Boolean(carrySystem.carriedIngredient);
    this.progress.value = system.cancelProgress;
  }

  dispose() { this.element.remove(); }
}

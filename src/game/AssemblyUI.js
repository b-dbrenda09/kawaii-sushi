import { PREPARED_NAMES } from './RecipeSystem.js';

export class AssemblyUI {
  constructor(container) {
    this.element = document.createElement('aside');
    this.element.className = 'assembly-panel';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Montagem de sushi');
    this.title = document.createElement('strong');
    this.recipeChoice = document.createElement('label');
    this.recipeChoice.append('Receita: ');
    this.recipeSelect = document.createElement('select');
    this.recipeSelect.setAttribute('aria-label', 'Receita para montar em qualquer ordem');
    this.recipeSelect.onchange = () => {
      if (container.dataset.paused === 'true' || !this.system?.selectRecipe(this.recipeSelect.value || null)) {
        this.recipeSelect.value = this.system?.targetRecipeId ?? '';
      }
      container.querySelector('canvas')?.focus({ preventScroll: true });
    };
    this.recipeChoice.append(this.recipeSelect);
    this.orderHelp = document.createElement('p');
    this.orderHelp.textContent = 'Escolha a receita e adicione os ingredientes em qualquer ordem!';
    this.sequence = document.createElement('p');
    this.next = document.createElement('p');
    this.cancel = document.createElement('div');
    this.progress = document.createElement('progress');
    this.progress.max = 1;
    this.progress.setAttribute('aria-label', 'Progresso para cancelar a montagem');
    this.cancel.append('Segure R por 1 segundo para cancelar', this.progress);
    this.element.append(this.title, this.recipeChoice, this.orderHelp, this.sequence, this.next, this.cancel);
    container.appendChild(this.element);
  }

  update(system, selected, carrySystem = system.carrySystem) {
    this.element.hidden = !selected || system.station.fireState === 'burning';
    if (this.element.hidden) return;
    if (this.system !== system) {
      this.recipeSelect.replaceChildren();
      for (const [id, name] of [['', 'Automático (arroz + salmão = nigiri)'], ...system.recipes.recipes.map(recipe => [recipe.id, recipe.name])]) {
        const option = this.element.ownerDocument.createElement('option');
        option.value = id; option.textContent = name; this.recipeSelect.append(option);
      }
      this.system = system;
    }
    this.recipeSelect.value = system.targetRecipeId ?? '';
    this.recipeSelect.disabled = system.state !== 'EMPTY' || Boolean(system.station.storedIngredient);
    this.recipeChoice.hidden = system.state === 'READY';
    this.orderHelp.hidden = system.state === 'READY';
    const { possible, next } = system.analysis;
    const ready = system.state === 'READY';
    const sequence = system.sequence;
    this.title.textContent = ready ? `${system.dish.recipeName} pronto!`
      : possible.length === 1 ? possible[0].name : 'Montagem de sushi';
    this.sequence.textContent = ready ? '✓ Montagem completa' : sequence.length
      ? `Montagem: ${sequence.map((state) => PREPARED_NAMES[state]).join(' + ')}` : 'Prato livre';
    const lengths = [...new Set(possible.map((recipe) => recipe.sequence.length))].sort();
    this.next.textContent = ready ? 'Libere as mãos para retirar o sushi.'
      : `Ingredientes que faltam: ${next.map((state) => PREPARED_NAMES[state]).join(' ou ')} • ${sequence.length}/${lengths.join('–')} ingredientes`;
    this.cancel.hidden = system.state !== 'ASSEMBLING' || Boolean(carrySystem.carriedIngredient);
    this.progress.value = system.cancelProgress;
  }

  dispose() { this.element.remove(); }
}

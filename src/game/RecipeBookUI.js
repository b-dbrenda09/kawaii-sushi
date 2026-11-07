import { RECIPES, PREPARED_NAMES } from './RecipeSystem.js';
import { PREPARATION_HELP, recipeIngredients, createRecipeIllustration } from './RecipePresentation.js';

export class RecipeBookUI {
  constructor(container, session) {
    this.session = session; this.document = container.ownerDocument; this.page = 0;
    const doc = this.document;
    this.button = doc.createElement('button'); this.button.type = 'button';
    this.button.className = 'recipe-book-button'; this.button.textContent = '📖 Receitas';
    this.button.setAttribute('aria-haspopup', 'dialog'); this.button.setAttribute('aria-expanded', 'false');
    this.button.onclick = () => this.open();
    this.root = doc.createElement('div'); this.root.className = 'recipe-book-overlay'; this.root.hidden = true;
    this.panel = doc.createElement('section'); this.panel.className = 'recipe-book';
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'recipe-book-title');
    this.root.append(this.panel); container.append(this.button, this.root);
    this.onKeyDown = event => {
      if (this.root.hidden) return;
      // Space é dash na cozinha; não deve ativar o botão Fechar por acidente.
      if (['Space', 'KeyE', 'KeyR', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) this.close(); }
      if (event.code === 'Tab') {
        const buttons = [...this.panel.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(doc.activeElement);
        event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    doc.defaultView.addEventListener('keydown', this.onKeyDown);
  }
  open() {
    if (!this.root.hidden) return;
    this.session.openRecipeBook();
    this.root.hidden = false; this.button.setAttribute('aria-expanded', 'true');
    this.render(); this.panel.querySelector('[data-book-action="close"]').focus({ preventScroll: true });
  }
  close() {
    if (this.root.hidden) return;
    this.root.hidden = true; this.button.setAttribute('aria-expanded', 'false');
    this.session.closeRecipeBook();
    if (this.session.paused) this.button.focus({ preventScroll: true });
  }
  render() {
    const doc = this.document, recipe = RECIPES[this.page];
    this.panel.replaceChildren();
    const element = (tag, text) => { const node = doc.createElement(tag); node.textContent = text; return node; };
    const button = (label, action, callback) => {
      const node = element('button', label); node.type = 'button'; node.dataset.bookAction = action;
      node.onclick = callback; return node;
    };
    const close = button('Fechar ×', 'close', () => this.close()); close.className = 'recipe-book-close';
    const title = element('h1', 'Livro de receitas'); title.id = 'recipe-book-title';
    const heading = element('h2', recipe.name);
    const sequence = element('p', recipeIngredients(recipe)); sequence.className = 'recipe-book-ingredients';
    const steps = doc.createElement('ol');
    for (const state of recipe.sequence) steps.append(element('li', `${PREPARED_NAMES[state]}: ${PREPARATION_HELP[state]}`));
    const assembly = element('p', `Na bancada de montagem livre, leve cada ingrediente preparado e pressione E para adicioná-lo ${recipe.orderIndependent ? 'em qualquer ordem, sem repetir ingredientes' : 'na ordem acima'}. Ao terminar, pressione E com as mãos vazias para pegar o sushi e leve-o ao balcão de entrega.`);
    const nav = doc.createElement('nav'); nav.setAttribute('aria-label', 'Páginas das receitas');
    const changePage = (offset, action) => {
      this.page += offset; this.render();
      const nextFocus = this.panel.querySelector(`[data-book-action="${action}"]:not(:disabled)`)
        ?? this.panel.querySelector(`[data-book-action="${offset > 0 ? 'previous' : 'next'}"]`);
      nextFocus.focus({ preventScroll: true });
    };
    const previous = button('← Anterior', 'previous', () => changePage(-1, 'previous'));
    const next = button('Próxima →', 'next', () => changePage(1, 'next'));
    previous.disabled = this.page === 0; next.disabled = this.page === RECIPES.length - 1;
    const count = element('span', `${this.page + 1} / ${RECIPES.length}`); count.setAttribute('aria-live', 'polite');
    nav.append(previous, count, next);
    this.panel.append(close, title, createRecipeIllustration(doc, recipe), heading, sequence, steps, assembly, nav);
    this.panel.dataset.recipeId = recipe.id;
  }
  dispose() {
    this.document.defaultView.removeEventListener('keydown', this.onKeyDown);
    this.button.remove(); this.root.remove();
  }
}

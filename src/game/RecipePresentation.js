import { PREPARED_NAMES } from './RecipeSystem.js';

// Instruções de preparo por ingrediente; a montagem não depende da ordem desta lista.
export const PREPARATION_HELP = Object.freeze({
  rice_cooked: 'Pegue arroz na caixa com E. Coloque na panela com E, espere cozinhar e retire com E antes de queimar.',
  salmon_cut: 'Pegue salmão e coloque na tábua com E (P1) ou P (P2). Segure a mesma tecla para cada corte até ficar pronto; toque para retirar.',
  cucumber_cut: 'Pegue pepino e coloque na tábua com E (P1) ou P (P2). Segure a mesma tecla para cada corte até ficar pronto; toque para retirar.',
  nori_sheet: 'Pegue a alga nori na caixa com E. Ela já está pronta para a montagem.',
});

export const recipeIngredients = recipe => {
  const counts = new Map();
  for (const state of recipe.sequence) counts.set(state, (counts.get(state) ?? 0) + 1);
  return [...counts].map(([state, count]) => `${count > 1 ? `${count} × ` : ''}${PREPARED_NAMES[state]}`).join(' + ');
};

// Reutiliza as ilustrações CSS que já aparecem nos cartões dos clientes.
export function createRecipeIllustration(document, recipe) {
  const icon = document.createElement('div'); icon.className = 'order-sushi';
  icon.dataset.model = recipe.model;
  icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', recipe.name);
  for (let i = 0; i < (recipe.model === 'nigiri' ? 2 : 3); i++) {
    const piece = document.createElement('span'); piece.className = 'sushi-piece';
    const filling = document.createElement('span'); filling.className = 'sushi-filling';
    piece.append(filling); icon.append(piece);
  }
  return icon;
}

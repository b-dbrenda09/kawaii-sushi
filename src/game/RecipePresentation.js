import { PREPARED_NAMES } from './RecipeSystem.js';

// Instruções por ingrediente; a lista e a ordem pertencem somente ao RecipeSystem.
export const PREPARATION_HELP = Object.freeze({
  rice_cooked: 'Pegue arroz na caixa com E. Coloque na panela com E, espere cozinhar e retire com E antes de queimar.',
  salmon_cut: 'Pegue salmão na caixa com E. Coloque na tábua e pressione E a cada corte até ficar pronto. Retire com E.',
  cucumber_cut: 'Pegue pepino na caixa com E. Coloque na tábua e pressione E a cada corte até ficar pronto. Retire com E.',
  nori_sheet: 'Pegue a alga nori na caixa com E. Ela já está pronta para a montagem.',
});

export const recipeIngredients = recipe => recipe.sequence.map(state => PREPARED_NAMES[state]).join(recipe.orderIndependent ? ' + ' : ' → ');

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

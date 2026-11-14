export const RECIPES = Object.freeze([
  { id: 'salmon_nigiri', name: 'Nigiri de salmão', model: 'nigiri', sequence: ['rice_cooked', 'salmon_cut'] },
  { id: 'salmon_maki', name: 'Maki de salmão', model: 'maki', sequence: ['nori_sheet', 'rice_cooked', 'salmon_cut'] },
  { id: 'cucumber_uramaki', name: 'Uramaki de pepino', model: 'uramaki', sequence: ['rice_cooked', 'nori_sheet', 'cucumber_cut'] },
].map((recipe) => Object.freeze({ ...recipe, sequence: Object.freeze(recipe.sequence) })));

export const PREPARED_NAMES = Object.freeze({ rice_cooked: 'arroz cozido', salmon_cut: 'salmão cortado',
  cucumber_cut: 'pepino cortado', nori_sheet: 'alga nori' });

export class RecipeSystem {
  constructor(recipes = RECIPES) {
    if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length
      || recipes.some((recipe) => !recipe.id || !recipe.sequence?.length)) throw new Error('Receitas inválidas.');
    this.recipes = recipes.map((recipe) => Object.freeze({ ...recipe, sequence: Object.freeze([...recipe.sequence]) }));
  }

  // `sequence` remains the recipe data format; matching treats it as a multiset.
  analyze(sequence, recipeId = null) {
    const remainingByRecipe = new Map();
    const possible = this.recipes.filter((recipe) => {
      if (recipeId !== null && recipe.id !== recipeId) return false;
      if (sequence.length > recipe.sequence.length) return false;
      // Remove uma ocorrência por ingrediente: duplicados nunca substituem os faltantes.
      const remaining = [...recipe.sequence];
      for (const state of sequence) {
        const index = remaining.indexOf(state);
        if (index === -1) return false;
        remaining.splice(index, 1);
      }
      remainingByRecipe.set(recipe, remaining);
      return true;
    });
    const next = [...new Set(possible.flatMap(recipe => remainingByRecipe.get(recipe)))];
    const matches = possible.filter(recipe => remainingByRecipe.get(recipe).length === 0);
    const complete = matches.length === 1 ? matches[0] : null;
    return { possible, complete, next, matches };
  }
}

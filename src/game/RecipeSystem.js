export const RECIPES = Object.freeze([
  { id: 'salmon_nigiri', name: 'Nigiri de salmão', model: 'nigiri', sequence: ['rice_cooked', 'salmon_cut'] },
  { id: 'salmon_maki', name: 'Maki de salmão', model: 'maki', sequence: ['nori_sheet', 'rice_cooked', 'salmon_cut'] },
  { id: 'cucumber_uramaki', name: 'Uramaki de pepino', model: 'uramaki', orderIndependent: true, sequence: ['rice_cooked', 'nori_sheet', 'cucumber_cut'] },
].map((recipe) => Object.freeze({ ...recipe, sequence: Object.freeze(recipe.sequence) })));

export const PREPARED_NAMES = Object.freeze({ rice_cooked: 'arroz cozido', salmon_cut: 'salmão cortado',
  cucumber_cut: 'pepino cortado', nori_sheet: 'alga nori' });

export class RecipeSystem {
  constructor(recipes = RECIPES) {
    if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length
      || recipes.some((recipe) => !recipe.id || !recipe.sequence?.length)) throw new Error('Receitas inválidas.');
    this.recipes = recipes.map((recipe) => Object.freeze({ ...recipe, sequence: Object.freeze([...recipe.sequence]) }));
  }

  analyze(sequence) {
    const remainingByRecipe = new Map();
    const possible = this.recipes.filter((recipe) => {
      if (sequence.length > recipe.sequence.length) return false;
      if (!recipe.orderIndependent) return sequence.every((state, index) => state === recipe.sequence[index]);
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
    const complete = possible.length === 1 && possible[0].sequence.length === sequence.length ? possible[0] : null;
    const next = [...new Set(possible.flatMap((recipe) => recipe.orderIndependent
      ? remainingByRecipe.get(recipe) : [recipe.sequence[sequence.length]]).filter(Boolean))];
    return { possible, complete, next };
  }
}

import { Box3, Group, Matrix4 } from 'three';
import { RecipeSystem } from './RecipeSystem.js';
import { BALANCE } from './Balance.js';
import { AssemblyEffects } from './AssemblyEffects.js';

export const ASSEMBLY_STATES = Object.freeze({ EMPTY: 'EMPTY', ASSEMBLING: 'ASSEMBLING', READY: 'READY' });

export class AssemblySystem {
  constructor({ station, carrySystem, factory, recipes = new RecipeSystem(), cancelDuration = BALANCE.assembly.cancelDuration }) {
    if (station.type !== 'assembly' || station.behavior || !station.storage) throw new Error('Ilha de montagem inválida.');
    if (!Number.isFinite(cancelDuration) || cancelDuration <= 0) throw new Error('Duração de cancelamento inválida.');
    this.station = station;
    this.carrySystem = carrySystem;
    this.factory = factory;
    this.recipes = recipes;
    this.cancelDuration = cancelDuration;
    this.state = 'EMPTY';
    this.ingredients = [];
    this.dish = null;
    this.plate = null;
    this.targetRecipeId = null;
    this.cancelElapsed = 0;
    this.cancelEligible = false;
    this.completionRemaining = 0;
    this.disposed = false;
    this.anchor = station.storage.anchor;
    this.contents = new Group();
    this.contents.name = 'assembly-consumed-ingredients';
    this.contents.visible = false;
    station.model.add(this.contents);
    this.effects = new AssemblyEffects(this);
    this.refreshPreview();
    station.behavior = this;
  }

  get sequence() { return this.ingredients.map((ingredient) => ingredient.state); }
  get analysis() { return this.recipes.analyze(this.sequence, this.targetRecipeId); }
  get cancelProgress() { return this.cancelElapsed / this.cancelDuration; }

  selectRecipe(recipeId) {
    if (this.disposed || this.station.fireState === 'burning' || this.station.interactingPlayer
      || this.state !== 'EMPTY' || this.ingredients.length || this.station.storedIngredient
      || (recipeId !== null && !this.recipes.recipes.some(recipe => recipe.id === recipeId))) return false;
    this.targetRecipeId = recipeId;
    if (this.plate) this.plate.targetRecipeId = recipeId;
    return true;
  }

  refreshPreview() {
    this.effects.clear();
    this.preview?.removeFromParent();
    this.preview?.clear();
    this.preview = this.factory.preview(this.sequence, { assembly: true });
    this.anchor.add(this.preview);
    this.fitVisual(this.preview);
  }

  // Mede no referencial do próprio modelo, inclusive sob pais rotacionados/escalados.
  fitVisual(model) {
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.scale.setScalar(1);
    model.updateWorldMatrix(true, true);
    const inverse = new Matrix4().copy(model.matrixWorld).invert(), bounds = new Box3();
    model.traverse(part => {
      if (!part.geometry) return;
      part.geometry.computeBoundingBox();
      const relative = new Matrix4().multiplyMatrices(inverse, part.matrixWorld);
      bounds.union(part.geometry.boundingBox.clone().applyMatrix4(relative));
    });
    if (bounds.isEmpty()) return;
    const scale = Math.min(1, this.station.storage.width * .94 / (bounds.max.x - bounds.min.x),
      this.station.storage.depth * .94 / (bounds.max.z - bounds.min.z));
    model.scale.setScalar(scale);
    model.position.set(-(bounds.min.x + bounds.max.x) / 2 * scale, .003 - bounds.min.y * scale,
      -(bounds.min.z + bounds.max.z) / 2 * scale);
    return { scale, floorOffset: model.position.y - 0.003 };
  }

  validNext(item) {
    return Boolean(item && !item.disposed && item.kind !== 'sushi' && this.analysis.next.includes(item.state));
  }

  describe(carrySystem = this.carrySystem) {
    const item = carrySystem.carriedIngredient;
    if (this.station.storedIngredient) return { action: item ? 'Superfície ocupada' : 'Pegar ingrediente', available: !item };
    if (this.state === 'READY') return { action: item ? 'Este prato já está pronto!' : 'Pegar sushi', available: !item };
    if (this.state === 'EMPTY' && !this.plate && item?.kind === 'preparation') return { action: 'Colocar prato e continuar montagem', available: carrySystem.fits(item, this.station) };
    if (this.state === 'EMPTY' && !this.plate && item?.kind === 'sushi') return { action: 'Colocar sushi', available: true };
    if (item && !this.validNext(item)) return { action: this.state === 'EMPTY' && !this.plate && !this.targetRecipeId && !item.kind ? 'Colocar ingrediente' : 'Ingrediente incorreto', available: this.state === 'EMPTY' && !this.plate && !this.targetRecipeId && !item.kind && carrySystem.fits(item, this.station) };
    if (!item) return { action: this.state === 'EMPTY' ? 'Pegar prato vazio' : 'Pegar preparação • segure R para cancelar', available: true };
    return { action: this.state === 'EMPTY' ? 'Iniciar montagem' : 'Adicionar ingrediente', available: true };
  }

  result(success, kind, message) { return { success, kind, message }; }

  interact(carrySystem = this.carrySystem) {
    if (this.station.fireState === 'burning') return this.result(false, 'burning', 'Estação em chamas!');
    if (carrySystem.carriedTool) return this.result(false, 'unavailable', 'Libere as mãos para preparar ingredientes.');
    if (this.station.interactingPlayer && this.station.interactingPlayer !== carrySystem.player) return this.result(false, 'unavailable', 'Bancada em uso.');
    this.carrySystem = carrySystem;
    if (this.disposed) return this.result(false, 'unavailable', 'Montagem indisponível.');
    const carried = this.carrySystem.carriedIngredient;
    if (this.station.storedIngredient) {
      const result = carried ? this.result(false, 'unavailable', 'Superfície ocupada.') : carrySystem.retrieve(this.station);
      if (result.success) this.preview.visible = true;
      return result;
    }
    if (!carried && this.state !== 'READY') return this.takePreparation();
    if (this.state === 'EMPTY' && carried?.kind === 'preparation' && !this.plate) {
      if (!carrySystem.fits(carried, this.station)) return this.result(false, 'unavailable', 'Não há espaço para o prato.');
      this.plate = carrySystem.transferTo(this.anchor, { location: 'assembly', ownerId: this.station.id });
      this.targetRecipeId = carried.targetRecipeId;
      this.ingredients = carried.ingredients;
      for (const ingredient of this.ingredients) {
        this.contents.add(ingredient.model); ingredient.location = 'assembly'; ingredient.ownerId = this.station.id;
      }
      this.plate.model.visible = false;
      this.state = this.ingredients.length ? 'ASSEMBLING' : 'EMPTY';
      this.resetCancellation(); this.refreshPreview();
      return this.result(true, 'place-preparation', 'Prato colocado. Continue a montagem.');
    }
    if (this.state === 'READY') {
      if (carried) return this.result(false, 'unavailable', 'Este prato já está pronto!');
      this.effects.clear();
      const dish = this.dish;
      this.dish = null;
      dish.model.scale.setScalar(1);
      this.carrySystem.attach(dish);
      this.state = 'EMPTY';
      this.targetRecipeId = null;
      this.preview.visible = true;
      this.completionRemaining = 0;
      return this.result(true, 'take-sushi', `Carregando: ${dish.name}.`);
    }
    if (this.state === 'EMPTY' && !this.plate && carried?.kind === 'sushi') {
      this.dish = this.carrySystem.transferTo(this.anchor, { location: 'surface', ownerId: this.station.id, position: [0, 0.005, 0] });
      this.fitVisual(this.dish.model);
      this.preview.visible = false;
      this.state = 'READY';
      return this.result(true, 'place-sushi', 'Sushi colocado na ilha.');
    }
    if (!this.validNext(carried)) {
      if (this.state === 'EMPTY' && !this.plate && !this.targetRecipeId && carried && !carried.kind) {
        const result = carrySystem.place(this.station);
        if (result.success) this.preview.visible = false;
        return result;
      }
      return this.result(false, 'unavailable', carried ? 'Ingrediente incorreto!' : 'Pegue um dos ingredientes indicados.');
    }
    const next = this.recipes.analyze([...this.sequence, carried.state], this.targetRecipeId);
    // Allocate before consuming the held ingredient; a failed allocation loses nothing.
    let dish = next.complete && !this.plate ? this.factory.create(next.complete) : null;
    this.ingredients.push(this.carrySystem.transferTo(this.contents, { location: 'assembly', ownerId: this.station.id }));
    this.resetCancellation();
    if (next.complete && this.plate) {
      dish = this.factory.completePreparation(this.plate, next.complete);
      this.plate = null;
      dish.model.visible = true;
    }
    if (dish) {
      for (const ingredient of this.ingredients) ingredient.dispose();
      this.ingredients = [];
      this.refreshPreview();
      this.preview.visible = false;
      this.dish = dish;
      dish.location = 'surface';
      dish.ownerId = this.station.id;
      this.anchor.add(dish.model);
      this.completionPose = this.fitVisual(dish.model);
      this.state = 'READY';
      this.completionRemaining = 0.6;
      this.animateCompletion(0);
      this.effects.finish(next.complete);
      this.carrySystem.player.gesture?.(.65, { duration: .55, kind: 'assembly' });
      return this.result(true, 'finish-sushi', `${dish.name} pronto!`);
    }
    this.state = 'ASSEMBLING';
    this.refreshPreview();
    this.effects.place(carried.state);
    this.carrySystem.player.gesture?.(.65, { duration: .55, kind: 'assembly' });
    return this.result(true, 'add-ingredient', 'Ingrediente adicionado à montagem.');
  }

  takePreparation() {
    this.effects.clear();
    const plate = this.plate ?? this.factory.createPreparation(this.ingredients, this.recipes, this.targetRecipeId);
    plate.ingredients = this.ingredients;
    plate.refresh();
    this.carrySystem.attach(plate);
    this.plate = null; this.ingredients = []; this.state = 'EMPTY';
    this.targetRecipeId = null;
    this.resetCancellation(); this.completionRemaining = 0;
    this.refreshPreview();
    return this.result(true, 'take-preparation', plate.ingredients.length ? 'Carregando preparação com todos os ingredientes.' : 'Carregando prato vazio.');
  }

  animateCompletion(dt) {
    if (!this.dish || !this.completionPose || this.completionRemaining <= 0) return;
    this.completionRemaining = Math.max(0, this.completionRemaining - dt);
    const t = 1 - this.completionRemaining / 0.6;
    const stretch = 1 - 0.36 * (1 - t) ** 4 + 0.14 * Math.sin(t * Math.PI * 2) * (1 - t);
    const { scale, floorOffset } = this.completionPose;
    this.dish.model.scale.y = scale * stretch;
    this.dish.model.position.y = 0.003 + floorOffset * stretch;
  }

  resetCancellation() { this.cancelElapsed = 0; this.cancelEligible = false; this.station.interactingPlayer = null; }

  update(deltaTime, { selected = false, cancelHeld = false, disabled = false } = {}) {
    if (this.disposed) return;
    if (this.station.fireState === 'burning') { this.resetCancellation(); return; }
    const dt = Number.isFinite(deltaTime) ? Math.max(0, Math.min(deltaTime, 1)) : 0;
    this.animateCompletion(dt);
    this.effects.update(Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0);
    const eligible = selected && cancelHeld && !disabled && this.state === 'ASSEMBLING'
      && !this.carrySystem.carriedIngredient && !this.carrySystem.player.movementLocked
      && this.carrySystem.player.state !== 'dashing' && !(this.carrySystem.player.dashRemaining > 0);
    if (!eligible) { this.resetCancellation(); return; }
    // Não atribui ao R o tempo anterior à sua ativação/entrada no alcance.
    if (!this.cancelEligible) { this.cancelEligible = true; this.station.interactingPlayer = this.carrySystem.player; return; }
    this.cancelElapsed = Math.min(this.cancelDuration, this.cancelElapsed + dt);
    if (this.cancelElapsed + 1e-9 < this.cancelDuration) return;
    for (const ingredient of this.ingredients) ingredient.dispose();
    this.ingredients = [];
    this.plate?.dispose(); this.plate = null;
    this.targetRecipeId = null;
    this.state = 'EMPTY';
    this.resetCancellation();
    this.refreshPreview();
    return this.result(true, 'cancel-assembly', 'Montagem cancelada.');
  }

  dispose() {
    if (this.disposed) return;
    this.effects.dispose();
    this.ingredients.forEach((ingredient) => ingredient.dispose());
    this.ingredients = [];
    this.dish?.dispose();
    this.plate?.dispose(); this.plate = null;
    this.dish = null;
    this.preview.removeFromParent();
    this.preview.clear();
    this.contents.removeFromParent();
    if (this.station.behavior === this) delete this.station.behavior;
    this.disposed = true;
  }
}

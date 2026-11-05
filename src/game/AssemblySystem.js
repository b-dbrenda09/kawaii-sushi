import { Group } from 'three';
import { RecipeSystem } from './RecipeSystem.js';

export const ASSEMBLY_STATES = Object.freeze({ EMPTY: 'EMPTY', ASSEMBLING: 'ASSEMBLING', READY: 'READY' });

export class AssemblySystem {
  constructor({ station, carrySystem, factory, recipes = new RecipeSystem(), cancelDuration = 1 }) {
    if (station.id !== 'assembly' || station.behavior || !station.storage) throw new Error('Ilha de montagem inválida.');
    if (!Number.isFinite(cancelDuration) || cancelDuration <= 0) throw new Error('Duração de cancelamento inválida.');
    this.station = station;
    this.carrySystem = carrySystem;
    this.factory = factory;
    this.recipes = recipes;
    this.cancelDuration = cancelDuration;
    this.state = 'EMPTY';
    this.ingredients = [];
    this.dish = null;
    this.cancelElapsed = 0;
    this.cancelEligible = false;
    this.completionRemaining = 0;
    this.disposed = false;
    this.anchor = station.storage.anchor;
    this.contents = new Group();
    this.contents.name = 'assembly-consumed-ingredients';
    this.contents.visible = false;
    station.model.add(this.contents);
    this.refreshPreview();
    station.behavior = this;
  }

  get sequence() { return this.ingredients.map((ingredient) => ingredient.state); }
  get analysis() { return this.recipes.analyze(this.sequence); }
  get cancelProgress() { return this.cancelElapsed / this.cancelDuration; }

  refreshPreview() {
    this.preview?.removeFromParent();
    this.preview?.clear();
    this.preview = this.factory.preview(this.sequence);
    this.preview.position.y = 0.005;
    this.anchor.add(this.preview);
  }

  validNext(item) {
    return Boolean(item && !item.disposed && item.kind !== 'sushi' && this.analysis.next.includes(item.state));
  }

  describe() {
    const item = this.carrySystem.carriedIngredient;
    if (this.state === 'READY') return { action: item ? 'Mãos ocupadas' : 'Pegar sushi', available: !item };
    if (this.state === 'EMPTY' && item?.kind === 'sushi') return { action: 'Colocar sushi', available: true };
    if (item && !this.validNext(item)) return { action: 'Ingrediente incorreto', available: false };
    if (!item) return { action: this.state === 'EMPTY' ? 'Ilha de montagem livre' : 'Adicionar ingredientes • segure R para cancelar', available: false };
    return { action: this.state === 'EMPTY' ? 'Iniciar montagem' : 'Adicionar ingrediente', available: true };
  }

  result(success, kind, message) { return { success, kind, message }; }

  interact() {
    if (this.disposed) return this.result(false, 'unavailable', 'Montagem indisponível.');
    const carried = this.carrySystem.carriedIngredient;
    if (this.state === 'READY') {
      if (carried) return this.result(false, 'unavailable', 'Mãos ocupadas');
      const dish = this.dish;
      this.dish = null;
      dish.model.scale.setScalar(1);
      this.carrySystem.attach(dish);
      this.state = 'EMPTY';
      this.preview.visible = true;
      this.completionRemaining = 0;
      return this.result(true, 'take-sushi', `Carregando: ${dish.name}.`);
    }
    if (this.state === 'EMPTY' && carried?.kind === 'sushi') {
      this.dish = this.carrySystem.transferTo(this.anchor, { location: 'surface', ownerId: this.station.id, position: [0, 0.005, 0] });
      this.preview.visible = false;
      this.state = 'READY';
      return this.result(true, 'place-sushi', 'Sushi colocado na ilha.');
    }
    if (!this.validNext(carried)) return this.result(false, 'unavailable', carried ? 'Ingrediente incorreto!' : 'Pegue um dos ingredientes indicados.');
    const next = this.recipes.analyze([...this.sequence, carried.state]);
    const dish = next.complete ? this.factory.create(next.complete) : null;
    this.ingredients.push(this.carrySystem.transferTo(this.contents, { location: 'assembly', ownerId: this.station.id }));
    this.resetCancellation();
    if (dish) {
      for (const ingredient of this.ingredients) ingredient.dispose();
      this.ingredients = [];
      this.refreshPreview();
      this.preview.visible = false;
      this.dish = dish;
      dish.location = 'surface';
      dish.ownerId = this.station.id;
      dish.model.position.y = 0.005;
      this.anchor.add(dish.model);
      this.state = 'READY';
      this.completionRemaining = 0.6;
      return this.result(true, 'finish-sushi', `${dish.name} pronto!`);
    }
    this.state = 'ASSEMBLING';
    this.refreshPreview();
    return this.result(true, 'add-ingredient', 'Ingrediente adicionado à montagem.');
  }

  resetCancellation() { this.cancelElapsed = 0; this.cancelEligible = false; }

  update(deltaTime, { selected = false, cancelHeld = false, disabled = false } = {}) {
    if (this.disposed) return;
    const dt = Number.isFinite(deltaTime) ? Math.max(0, Math.min(deltaTime, 1)) : 0;
    this.completionRemaining = Math.max(0, this.completionRemaining - dt);
    if (this.dish) {
      const pulse = 1 + Math.sin((0.6 - this.completionRemaining) / 0.6 * Math.PI) * 0.035;
      this.dish.model.scale.setScalar(this.completionRemaining > 0 ? pulse : 1);
    }
    const eligible = selected && cancelHeld && !disabled && this.state === 'ASSEMBLING'
      && !this.carrySystem.carriedIngredient && !this.carrySystem.player.movementLocked
      && this.carrySystem.player.state !== 'dashing' && !(this.carrySystem.player.dashRemaining > 0);
    if (!eligible) { this.resetCancellation(); return; }
    // Não atribui ao R o tempo anterior à sua ativação/entrada no alcance.
    if (!this.cancelEligible) { this.cancelEligible = true; return; }
    this.cancelElapsed = Math.min(this.cancelDuration, this.cancelElapsed + dt);
    if (this.cancelElapsed + 1e-9 < this.cancelDuration) return;
    for (const ingredient of this.ingredients) ingredient.dispose();
    this.ingredients = [];
    this.state = 'EMPTY';
    this.resetCancellation();
    this.refreshPreview();
    return this.result(true, 'cancel-assembly', 'Montagem cancelada.');
  }

  dispose() {
    if (this.disposed) return;
    this.ingredients.forEach((ingredient) => ingredient.dispose());
    this.ingredients = [];
    this.dish?.dispose();
    this.dish = null;
    this.preview.removeFromParent();
    this.preview.clear();
    this.contents.removeFromParent();
    if (this.station.behavior === this) delete this.station.behavior;
    this.disposed = true;
  }
}

import { INGREDIENT_TYPES } from './Ingredient.js';

export class CarrySystem {
  constructor({ player, stations, factory }) {
    this.player = player;
    this.stations = stations;
    this.factory = factory;
    this.carriedIngredient = null;
    this.carriedTool = null;
    this.disposed = false;
  }

  describe(station) {
    if (station.fireSystem?.isBurning(station)) return { action: this.carriedTool ? 'Segure a tecla para apagar o fogo' : 'Estação em chamas!', available: Boolean(this.carriedTool), showKey: Boolean(this.carriedTool) };
    if (this.carriedTool && station.type !== 'extinguisher') return { action: `${this.player.id === 'p2' ? 'O' : 'Q'}: deixar extintor no chão`, available: false };
    if (station.behavior) return station.behavior.describe(this, station);
    const carried = this.carriedIngredient;
    const source = station.ingredientSource;
    if (source) {
      if (carried?.kind) return { action: 'Mãos ocupadas', available: false };
      const label = INGREDIENT_TYPES[source.ingredient].label;
      return { action: `${!carried ? 'Pegar' : carried.originBoxId === station.id ? 'Devolver' : 'Trocar por'} ${label}`, available: true };
    }
    if (station.storage) {
      if (station.storedIngredient?.kind === 'sushi' && carried) return { action: 'Este prato já está pronto!', available: false };
      if (station.storedIngredient?.kind === 'preparation' && carried) return {
        action: station.storedIngredient.accepts(carried) ? 'Adicionar ingrediente ao prato' : 'Ingrediente incorreto',
        available: station.storedIngredient.accepts(carried) };
      if (carried && station.storedIngredient) return { action: 'Superfície ocupada', available: false };
      if (carried) return { action: carried.kind ? 'Colocar prato' : 'Colocar ingrediente', available: this.fits(carried, station) };
      return { action: station.storedIngredient?.kind ? 'Pegar prato' : station.storedIngredient ? 'Pegar ingrediente' : 'Superfície livre', available: Boolean(station.storedIngredient) };
    }
    if (station.id === 'trash') return { action: carried ? 'Descartar' : 'Nada para descartar', available: Boolean(carried) };
    return { action: station.id === 'riceCooker' ? 'Cozimento indisponível' : 'Entrega indisponível', available: false };
  }

  result(success, kind, message) {
    return { success, kind, message };
  }

  attach(ingredient) {
    if (ingredient.location === 'carried' && ingredient.ownerId !== (this.player.id ?? 'player')) throw new Error('Objeto já carregado por outro jogador.');
    if (this.carriedTool || ingredient.disposed || (this.carriedIngredient && !this.carriedIngredient.disposed && this.carriedIngredient !== ingredient)) {
      throw new Error('Não é possível carregar dois ingredientes ou recuperar um objeto removido.');
    }
    ingredient.model.removeFromParent();
    ingredient.model.position.set(0, 0, 0);
    ingredient.model.rotation.set(0, 0, 0);
    ingredient.model.scale.setScalar(1);
    ingredient.model.visible = true;
    this.player.carryAnchor.position.z = Math.max(0.67, 0.44 + ingredient.dimensions.depth / (2 * this.player.modelScale));
    this.player.carryAnchor.add(ingredient.model);
    this.player.gesture?.(0.26);
    ingredient.location = 'carried';
    ingredient.ownerId = this.player.id ?? 'player';
    this.carriedIngredient = ingredient;
  }

  fits(ingredient, station) {
    return Boolean(station.storage && ingredient.dimensions.width <= station.storage.width + 1e-6
      && ingredient.dimensions.depth <= station.storage.depth + 1e-6);
  }

  transferTo(anchor, { location, ownerId, position = [0, 0, 0] }) {
    if (!this.carriedIngredient || this.disposed) throw new Error('Não há ingrediente para transferir.');
    const ingredient = this.carriedIngredient;
    ingredient.model.removeFromParent();
    ingredient.model.position.set(...position);
    ingredient.model.rotation.set(0, 0, 0);
    anchor.add(ingredient.model);
    this.player.gesture?.(0.65);
    ingredient.location = location;
    ingredient.ownerId = ownerId;
    this.carriedIngredient = null;
    return ingredient;
  }

  takeFromBox(station) {
    if (this.carriedTool) return this.result(false, 'unavailable', 'Mãos ocupadas com o extintor.');
    if (this.carriedIngredient?.kind) return this.result(false, 'unavailable', 'Apoie ou descarte o prato antes de pegar ingredientes.');
    if (this.carriedIngredient?.originBoxId === station.id) return this.returnIngredient();
    // Cria primeiro: se a fábrica falhar, o ingrediente atual continua intacto.
    const next = this.factory.create(station.ingredientSource.ingredient);
    const replacing = Boolean(this.carriedIngredient);
    this.carriedIngredient?.dispose();
    this.attach(next);
    return this.result(true, replacing ? 'swap' : 'pickup', `${replacing ? 'Troca concluída' : 'Carregando'}: ${next.name}.`);
  }

  returnIngredient() {
    if (!this.carriedIngredient) return this.result(false, 'unavailable', 'As mãos estão vazias.');
    // Estoque ilimitado: a devolução é lógica, sem adicionar decoração à caixa.
    this.carriedIngredient.dispose();
    this.carriedIngredient = null;
    return this.result(true, 'return', 'Ingrediente devolvido à caixa de origem.');
  }

  place(station) {
    if (!this.carriedIngredient) return this.result(false, 'unavailable', 'Pegue um ingrediente para usar esta superfície.');
    if (!station.storage) return this.result(false, 'unavailable', 'Esta estação não aceita armazenamento.');
    const plate = station.storedIngredient;
    if (plate?.kind === 'sushi') return this.result(false, 'unavailable', 'Este prato já está pronto!');
    if (plate?.kind === 'preparation' && plate.accepts(this.carriedIngredient)) {
      const item = this.transferTo(plate.contents, { location: 'preparation', ownerId: plate.instanceId });
      plate.addIngredient(item);
      return this.result(true, plate.kind === 'sushi' ? 'finish-sushi' : 'add-ingredient', plate.kind === 'sushi' ? `${plate.name} pronto!` : 'Ingrediente adicionado ao prato.');
    }
    if (station.storedIngredient) return this.result(false, 'unavailable', 'Superfície ocupada. Libere as mãos para pegar o ingrediente.');
    if (!this.fits(this.carriedIngredient, station)) return this.result(false, 'unavailable', 'Não há espaço para este ingrediente.');
    const ingredient = this.transferTo(station.storage.anchor, { location: 'surface', ownerId: station.id, position: [0, 0.005, 0] });
    station.storedIngredient = ingredient;
    return this.result(true, 'place', 'Ingrediente colocado na superfície.');
  }

  retrieve(station) {
    if (this.carriedIngredient || this.carriedTool) return this.result(false, 'unavailable', 'Suas mãos já estão ocupadas.');
    if (!station.storage || !station.storedIngredient) return this.result(false, 'unavailable', 'A superfície está livre.');
    const ingredient = station.storedIngredient;
    this.attach(ingredient);
    station.storedIngredient = null;
    return this.result(true, 'retrieve', `Carregando: ${ingredient.name}.`);
  }

  discard({ force = false } = {}) {
    if (this.carriedIngredient?.deliveryReservation && !force) return this.result(false, 'unavailable', 'Prato reservado para o desafio da entrega.');
    if (!this.carriedIngredient) return this.result(false, 'unavailable', 'Nada para descartar.');
    this.carriedIngredient.dispose();
    this.carriedIngredient = null;
    return this.result(true, 'discard', 'Ingrediente descartado.');
  }

  interact(station, options = {}) {
    if (this.carriedIngredient?.deliveryReservation) return this.result(false, 'unavailable', 'Prato reservado para o desafio da entrega.');
    if (station.fireSystem?.isBurning(station)) return this.result(false, 'burning', this.carriedTool ? 'Segure sua tecla de interação para apagar o fogo.' : 'Estação em chamas!');
    if (this.carriedTool && station.type !== 'extinguisher') return this.result(false, 'unavailable', 'Deixe o extintor no chão ou no suporte.');
    if (this.disposed || this.stations.get(station.id) !== station || this.player.movementLocked || this.player.state === 'dashing'
      || this.player.dashRemaining > 0) return this.result(false, 'unavailable', 'Interação indisponível.');
    if (station.behavior) return station.behavior.interact(this, options);
    if (station.ingredientSource) return this.takeFromBox(station);
    if (station.id === 'trash') return this.discard();
    if (station.storage) return this.carriedIngredient ? this.place(station) : this.retrieve(station);
    return this.result(false, 'unavailable', 'Esta estação ainda não permite preparo ou armazenamento.');
  }

  dispose() {
    if (this.disposed) return;
    if (this.carriedTool?.owner === this) this.carriedTool.dock();
    this.discard({ force: true });
    for (const station of this.stations.values()) {
      station.storedIngredient?.dispose();
      station.storedIngredient = null;
    }
    this.disposed = true;
  }
}

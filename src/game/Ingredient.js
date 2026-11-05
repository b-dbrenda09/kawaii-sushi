export const INGREDIENT_TYPES = Object.freeze({
  salmon: Object.freeze({ id: 'salmon', name: 'Salmão', label: 'salmão', initialState: 'salmon_raw', originBoxId: 'salmonBox' }),
  rice: Object.freeze({ id: 'rice', name: 'Arroz cru', label: 'arroz', initialState: 'rice_raw', originBoxId: 'riceBox' }),
  cucumber: Object.freeze({ id: 'cucumber', name: 'Pepino', label: 'pepino', initialState: 'cucumber_whole', originBoxId: 'cucumberBox' }),
  nori: Object.freeze({ id: 'nori', name: 'Alga nori', label: 'nori', initialState: 'nori_sheet', originBoxId: 'noriBox' }),
});

export class Ingredient {
  constructor(definition, instanceId, model, dimensions, onDispose) {
    this.id = definition.id;
    this.type = definition.id;
    this.name = definition.name;
    this.state = definition.initialState;
    this.originBoxId = definition.originBoxId;
    this.instanceId = instanceId;
    this.model = model;
    this.dimensions = dimensions;
    this.location = 'unassigned';
    this.ownerId = null;
    this.disposed = false;
    this.onDispose = onDispose;
    model.name = instanceId;
    model.userData.ingredientId = this.id;
    model.userData.instanceId = instanceId;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.model.removeFromParent();
    this.model.clear();
    this.location = 'removed';
    this.ownerId = null;
    // A fábrica mantém os recursos compartilhados até o encerramento do jogo.
    this.onDispose?.(this);
    this.onDispose = null;
  }
}

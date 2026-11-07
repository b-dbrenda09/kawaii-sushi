import { Group, Vector3 } from 'three';

export const CUTTING_STATES = Object.freeze({ EMPTY: 'EMPTY', LOADED: 'LOADED', CUTTING: 'CUTTING', READY: 'READY' });
import { BALANCE } from './Balance.js';
const TRANSITIONS = { EMPTY: ['LOADED'], LOADED: ['CUTTING'], CUTTING: ['LOADED', 'READY'], READY: ['EMPTY'] };
const PREPARED = { salmon_raw: 'salmon_cut', cucumber_whole: 'cucumber_cut' };

export class CuttingSystem {
  constructor({ station, player, carrySystem, factory, effects = null, sound = null,
    requiredCuts = BALANCE.cutting.requiredCuts, strokeDuration = BALANCE.cutting.strokeDuration, recoverySpeed = 16 }) {
    if (station?.type !== 'cutting' || station.behavior || station.storedIngredient) throw new Error('Uma bancada de corte livre é necessária.');
    if (!Number.isInteger(requiredCuts) || requiredCuts < 1 || ![strokeDuration, recoverySpeed].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error('Configuração de corte inválida.');
    }
    this.station = station;
    this.player = player;
    this.carrySystem = carrySystem;
    this.factory = factory;
    this.effects = effects;
    this.sound = sound;
    this.requiredCuts = requiredCuts;
    this.strokeDuration = strokeDuration;
    this.recoverySpeed = recoverySpeed;
    this.aimFraction = 0.35;
    this._state = 'EMPTY';
    this.cuts = 0;
    this.strokeElapsed = 0;
    this.impacted = false;
    this.disposed = false;
    this.target = new Vector3();
    const board = station.model.getObjectByName('cutting-board');
    if (!board) throw new Error('Tábua de corte não encontrada.');
    board.geometry.computeBoundingBox();
    const top = board.position.y + board.geometry.boundingBox.max.y * board.scale.y;
    this.boardAnchor = new Group();
    this.boardAnchor.name = 'cutting-content';
    this.boardAnchor.position.set(board.position.x, top + 0.005, board.position.z + 0.15);
    station.model.add(this.boardAnchor);
    station.model.updateWorldMatrix(true, true);
    this.originalInteractionArea = station.interactionArea;
    station.interactionArea = Object.freeze({
      position: station.model.localToWorld(new Vector3(board.position.x, 0, station.localDimensions.depth / 2 + 0.72)), radius: BALANCE.interaction.cuttingAreaRadius,
    });
    station.behavior = this;
    this.effects?.update(0, this);
  }

  get state() { return this._state; }
  get content() { return this.station.storedIngredient; }
  get isCutting() { return this.state === 'CUTTING'; }
  get progress() { return this.cuts / this.requiredCuts; }
  get strokeProgress() { return this.isCutting ? Math.min(1, this.strokeElapsed / this.strokeDuration) : 0; }
  get chopProgress() { return Math.max(0, (this.strokeProgress - this.aimFraction) / (1 - this.aimFraction)); }

  accepts(ingredient) {
    return Boolean(ingredient && !ingredient.disposed && ((ingredient.type === 'salmon' && ingredient.state === 'salmon_raw')
      || (ingredient.type === 'cucumber' && ingredient.state === 'cucumber_whole')));
  }

  transition(next) {
    if (this.disposed || !TRANSITIONS[this.state]?.includes(next)) throw new Error(`Transição de corte inválida: ${this.state} -> ${next}`);
    const valid = next === 'EMPTY' ? !this.content
      : this.content && !this.content.disposed && (next === 'READY'
        ? ['salmon_cut', 'cucumber_cut'].includes(this.content.state) && this.cuts === this.requiredCuts
        : Boolean(PREPARED[this.content.state]) && this.cuts < this.requiredCuts);
    if (!valid) throw new Error(`Conteúdo incompatível com a bancada: ${next}`);
    this._state = next;
  }

  result(success, kind, message) { return { success, kind, message }; }

  describe(carrySystem = this.carrySystem) {
    const held = carrySystem.carriedIngredient;
    if (this.state === 'EMPTY') {
      const valid = this.accepts(held);
      return { action: valid ? 'Colocar ingrediente' : held ? 'Ingrediente não pode ser cortado' : 'Bancada vazia', available: Boolean(valid), showKey: Boolean(valid) };
    }
    if (this.state === 'CUTTING') return { action: 'Cortando...', available: false, showKey: false };
    if (held) return { action: 'Mãos ocupadas', available: false, showKey: false };
    return { action: this.state === 'READY' ? 'Pegar ingrediente cortado' : 'Cortar', available: true, showKey: true };
  }

  load() {
    if (this.disposed || this.state !== 'EMPTY') return this.result(false, 'unavailable', 'A bancada já está ocupada.');
    const ingredient = this.carrySystem.carriedIngredient;
    if (!ingredient) return this.result(false, 'unavailable', 'Bancada vazia');
    if (!this.accepts(ingredient)) return this.result(false, 'unavailable', 'Ingrediente não pode ser cortado');
    this.station.storedIngredient = this.carrySystem.transferTo(this.boardAnchor, { location: 'cutting', ownerId: this.station.id });
    this.cuts = 0;
    this.strokeElapsed = 0;
    this.transition('LOADED');
    this.effects?.update(0, this);
    return this.result(true, 'load-cutting', 'Ingrediente colocado. Pressione E para cortar.');
  }

  strike() {
    if (this.disposed || this.state !== 'LOADED') return this.result(false, 'unavailable', 'Aguarde o golpe terminar.');
    if (this.carrySystem.carriedIngredient) return this.result(false, 'unavailable', 'Mãos ocupadas');
    this.boardAnchor.getWorldPosition(this.target);
    if (!this.player.beginCutting(this.target, { recoverySpeed: this.recoverySpeed, aimFraction: this.aimFraction })) {
      return this.result(false, 'unavailable', 'Não é possível cortar agora.');
    }
    this.strokeElapsed = 0;
    this.impacted = false;
    this.transition('CUTTING');
    this.station.interactingPlayer = this.player;
    this.effects?.update(0, this);
    return this.result(true, 'cut-stroke', 'Golpe de corte iniciado.');
  }

  retrieve() {
    if (this.disposed || this.state !== 'READY') return this.result(false, 'unavailable', 'Finalize os cortes antes de retirar.');
    if (this.carrySystem.carriedIngredient) return this.result(false, 'unavailable', 'Mãos ocupadas');
    const ingredient = this.content;
    this.carrySystem.attach(ingredient);
    this.station.storedIngredient = null;
    this.cuts = 0;
    this.strokeElapsed = 0;
    this.transition('EMPTY');
    this.effects?.update(0, this);
    return this.result(true, 'take-cut-ingredient', `Carregando: ${ingredient.name}.`);
  }

  interact(carrySystem = this.carrySystem) {
    if (this.station.interactingPlayer && this.station.interactingPlayer !== carrySystem.player) return this.result(false, 'unavailable', 'Bancada em uso.');
    this.carrySystem = carrySystem;
    this.player = carrySystem.player;
    if (this.disposed) return this.result(false, 'unavailable', 'Bancada indisponível.');
    switch (this.state) {
      case 'EMPTY': return this.load();
      case 'LOADED': return this.strike();
      case 'CUTTING': return this.result(false, 'unavailable', 'Cortando...');
      case 'READY': return this.retrieve();
      default: return this.result(false, 'unavailable', 'Bancada indisponível.');
    }
  }

  update(deltaTime) {
    if (this.disposed) return;
    deltaTime = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
    if (this.isCutting) {
      this.strokeElapsed = Math.min(this.strokeDuration, this.strokeElapsed + deltaTime);
      this.player.setCuttingProgress(this.strokeProgress);
      if (!this.impacted && this.chopProgress >= 0.6 - 1e-9) {
        this.impacted = true;
        this.effects?.impact(this);
        this.sound?.playChop();
      }
      if (this.strokeElapsed >= this.strokeDuration - 1e-9) {
        this.cuts++;
        if (this.cuts === this.requiredCuts) {
          this.factory.setCutState(this.content, PREPARED[this.content.state]);
          this.transition('READY');
          this.sound?.playComplete();
        } else this.transition('LOADED');
        this.player.endCutting();
        this.station.interactingPlayer = null;
        this.strokeElapsed = 0;
      }
    }
    this.effects?.update(deltaTime, this);
  }

  cancelStroke() {
    if (!this.isCutting) return;
    this.player.endCutting();
    this.station.interactingPlayer = null;
    this.strokeElapsed = 0;
    this.transition('LOADED');
    this.effects?.update(0, this);
  }

  dispose() {
    if (this.disposed) return;
    this.cancelStroke();
    this.disposed = true;
    this.content?.dispose();
    this.station.storedIngredient = null;
    this.boardAnchor.removeFromParent();
    this.effects?.dispose();
    if (this.originalInteractionArea === undefined) delete this.station.interactionArea;
    else this.station.interactionArea = this.originalInteractionArea;
    if (this.station.behavior === this) this.station.behavior = null;
  }
}

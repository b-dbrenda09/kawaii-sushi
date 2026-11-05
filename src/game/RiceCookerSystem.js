import { Group } from 'three';

export const RICE_COOKER_STATES = Object.freeze({ EMPTY: 'EMPTY', LOADED: 'LOADED', COOKING: 'COOKING', READY: 'READY', BURNT: 'BURNT' });
const TRANSITIONS = Object.freeze({ EMPTY: ['LOADED'], LOADED: ['COOKING'], COOKING: ['READY'], READY: ['EMPTY', 'BURNT'], BURNT: ['EMPTY'] });
const EPSILON = 1e-9;

export class RiceCookerSystem {
  constructor({ station, carrySystem, factory, effects = null, cookDuration = 8, burnDelay = 12 }) {
    if (station?.id !== 'riceCooker' || station.behavior) throw new Error('A estação riceCooker existente é necessária.');
    if (![cookDuration, burnDelay].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Tempos da panela devem ser positivos.');
    this.station = station;
    this.carrySystem = carrySystem;
    this.factory = factory;
    this.effects = effects;
    this.cookDuration = cookDuration;
    this.burnDelay = burnDelay;
    this._state = 'EMPTY';
    this.elapsed = 0;
    this.content = null;
    this.disposed = false;
    this.contentAnchor = new Group();
    this.contentAnchor.name = 'rice-cooker-content';
    this.contentAnchor.position.set(-0.15, 1.49, 0);
    station.model.add(this.contentAnchor);
    station.behavior = this;
    this.effects?.update(0, this);
  }

  get state() { return this._state; }
  get progress() { return this.state === 'COOKING' ? Math.min(1, this.elapsed / this.cookDuration) : this.state === 'READY' ? 1 : 0; }
  get burnRemaining() { return this.state === 'READY' ? Math.max(0, this.burnDelay - this.elapsed) : 0; }

  transition(next) {
    if (this.disposed || !TRANSITIONS[this.state]?.includes(next)) throw new Error(`Transição inválida da panela: ${this.state} -> ${next}`);
    const requiredContent = { LOADED: 'rice_raw', COOKING: 'rice_raw', READY: 'rice_cooked', BURNT: 'rice_burnt' }[next];
    if (next === 'EMPTY' ? this.content !== null : !this.content || this.content.disposed || this.content.state !== requiredContent) {
      throw new Error(`Conteúdo incompatível com o estado da panela: ${next}`);
    }
    this._state = next;
    this.elapsed = 0;
    this.effects?.update(0, this);
  }

  result(success, kind, message) { return { success, kind, message }; }

  describe() {
    const carried = this.carrySystem.carriedIngredient;
    switch (this.state) {
      case 'EMPTY': {
        const accepts = carried?.type === 'rice' && carried.state === 'rice_raw';
        return { action: accepts ? 'Colocar arroz' : carried ? 'Apenas arroz cru' : 'Panela vazia', available: accepts, showKey: accepts };
      }
      case 'LOADED': return { action: 'Iniciar cozimento', available: true, showKey: true };
      case 'COOKING': return { action: 'Cozinhando...', available: false, showKey: false };
      case 'READY': return { action: carried ? 'Mãos ocupadas' : 'Pegar arroz cozido', available: !carried, showKey: !carried };
      case 'BURNT': return { action: 'Descartar arroz queimado', available: true, showKey: true };
      default: return { action: 'Panela indisponível', available: false, showKey: false };
    }
  }

  load() {
    const ingredient = this.carrySystem.carriedIngredient;
    if (this.disposed || this.state !== 'EMPTY') return this.result(false, 'unavailable', 'A panela já está ocupada.');
    if (!ingredient) return this.result(false, 'unavailable', 'Pegue arroz cru para abastecer a panela.');
    if (ingredient.type !== 'rice' || ingredient.state !== 'rice_raw') return this.result(false, 'unavailable', 'A panela aceita apenas arroz cru.');
    this.content = this.carrySystem.transferTo(this.contentAnchor, { location: 'cooker', ownerId: this.station.id });
    // O mesmo ingrediente fica dentro da panela fechada, com seu estado e identidade preservados.
    this.content.model.visible = false;
    this.transition('LOADED');
    return this.result(true, 'load-rice', 'Arroz colocado. Pressione E novamente para iniciar.');
  }

  start() {
    if (this.disposed || this.state !== 'LOADED') return this.result(false, 'unavailable', 'Não é possível iniciar outro cozimento.');
    this.transition('COOKING');
    return this.result(true, 'start-cooking', `Cozimento iniciado. O arroz ficará pronto em ${this.cookDuration} segundos.`);
  }

  retrieve() {
    if (this.disposed || this.state !== 'READY') return this.result(false, 'unavailable', 'O arroz ainda não está pronto.');
    if (this.carrySystem.carriedIngredient) return this.result(false, 'unavailable', 'Mãos ocupadas');
    const ingredient = this.content;
    this.carrySystem.attach(ingredient);
    this.content = null;
    this.transition('EMPTY');
    return this.result(true, 'take-cooked-rice', 'Carregando: Arroz cozido.');
  }

  discardBurnt() {
    if (this.disposed || this.state !== 'BURNT') return this.result(false, 'unavailable', 'Não há arroz queimado para descartar.');
    this.content.dispose();
    this.content = null;
    this.transition('EMPTY');
    return this.result(true, 'discard-burnt-rice', 'Arroz queimado descartado. A panela está vazia.');
  }

  interact() {
    if (this.disposed) return this.result(false, 'unavailable', 'Panela indisponível.');
    // Uma única ramificação por pressionamento: colocar nunca inicia o preparo.
    switch (this.state) {
      case 'EMPTY': return this.load();
      case 'LOADED': return this.start();
      case 'COOKING': return this.result(false, 'unavailable', 'O arroz ainda está cozinhando.');
      case 'READY': return this.retrieve();
      case 'BURNT': return this.discardBurnt();
      default: return this.result(false, 'unavailable', 'Panela indisponível.');
    }
  }

  update(deltaTime) {
    if (this.disposed) return;
    deltaTime = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
    let remaining = deltaTime;
    // Carrega o excedente entre estados, inclusive em quadros lentos que cruzam dois limites.
    while (remaining > 0 && (this.state === 'COOKING' || this.state === 'READY')) {
      const duration = this.state === 'COOKING' ? this.cookDuration : this.burnDelay;
      const untilTransition = Math.max(0, duration - this.elapsed);
      if (remaining + EPSILON < untilTransition) {
        this.elapsed += remaining;
        break;
      }
      remaining = Math.max(0, remaining - untilTransition);
      if (this.state === 'COOKING') {
        this.factory.setRiceState(this.content, 'rice_cooked');
        this.transition('READY');
      } else {
        this.factory.setRiceState(this.content, 'rice_burnt');
        this.transition('BURNT');
      }
    }
    this.effects?.update(deltaTime, this);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.content?.dispose();
    this.content = null;
    this.elapsed = 0;
    this.contentAnchor.removeFromParent();
    if (this.station.behavior === this) this.station.behavior = null;
    this.effects?.dispose();
  }
}

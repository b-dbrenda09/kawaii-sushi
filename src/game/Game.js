import { PCFShadowMap, WebGLRenderer } from 'three';
import { Camera } from './Camera.js';
import { Scene } from './Scene.js';
import { Input } from './Input.js';
import { CollisionSystem } from './CollisionSystem.js';
import { InteractionSystem } from './InteractionSystem.js';
import { InteractionUI } from './InteractionUI.js';
import { IngredientFactory } from './IngredientFactory.js';
import { CarrySystem } from './CarrySystem.js';
import { SoundSystem } from './SoundSystem.js';
import { SushiFactory } from './SushiFactory.js';
import { CustomerSystem } from './CustomerSystem.js';
import { OrderUI } from './OrderUI.js';
import { PreparationSystem } from './PreparationSystem.js';
import { SessionState } from './SessionState.js';
import { PauseUI } from './PauseUI.js';

export class Game {
  constructor(container, { onMainMenu = () => window.location.reload() } = {}) {
    if (!container) throw new Error('Contêiner #app não encontrado.');
    this.container = container;
    this.running = false; this.disposed = false; this.frameId = null; this.previousTime = null;
    this.renderer = new WebGLRenderer({ antialias: true });
    try {
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFShadowMap;
      this.renderer.domElement.setAttribute('aria-label', 'Kawaii Sushi: cozinha 3D isométrica');
      this.renderer.domElement.setAttribute('role', 'img'); this.renderer.domElement.tabIndex = 0;
      this.world = new Scene();
      this.collisionSystem = new CollisionSystem({ bounds: this.world.collisionBounds });
      this.world.collisionObstacles.forEach(obstacle => this.collisionSystem.registerObstacle(obstacle));
      this.world.player.collisionSystem = this.collisionSystem;
      this.collisionDebug = new URLSearchParams(window.location.search).get('debugCollisions') === '1';
      this.customerSystem = new CustomerSystem({ scene: this.world.scene,
        delivery: this.world.kitchen.stations.get('delivery'), collisionSystem: this.collisionSystem, architecture: this.world.architecture });
      this.world.bounds.union(this.customerSystem.bounds);
      this.orderSystem = this.customerSystem.orderSystem;
      this.orderUI = new OrderUI(container);
      this.camera = new Camera(container.clientWidth, container.clientHeight, this.world.bounds);
      this.input = new Input(this.camera.camera);
      this.interactionUI = new InteractionUI(container);
      this.ingredientFactory = new IngredientFactory(); this.sushiFactory = new SushiFactory();
      this.carrySystem = new CarrySystem({ player: this.world.player, stations: this.world.kitchen.stations, factory: this.ingredientFactory });
      this.sound = new SoundSystem();
      this.preparation = new PreparationSystem({ stations: this.world.kitchen.stations, carrySystem: this.carrySystem,
        factory: this.ingredientFactory, sushiFactory: this.sushiFactory, sound: this.sound, container });
      this.riceCookers = this.preparation.riceCookers;
      this.cuttingSystems = this.preparation.cuttingSystems;
      this.assemblySystems = this.preparation.assemblySystems;
      // Compatibilidade com ferramentas anteriores; o loop só percorre as coleções.
      this.riceCooker = this.riceCookers.get('riceCooker');
      this.cuttingSystem = this.cuttingSystems.get('cutting');
      this.assemblySystem = this.assemblySystems.get('assembly');
      this.riceCookerUI = this.preparation.riceUIs.get('riceCooker');
      this.cuttingUI = this.preparation.cuttingUIs.get('cutting');
      this.assemblyUI = this.preparation.assemblyUI;
      this.interactionSystem = new InteractionSystem({ stations: this.world.kitchen.stations.values(),
        collisionSystem: this.collisionSystem, ui: this.interactionUI, carrySystem: this.carrySystem,
        onInteract: event => { if (import.meta.env.DEV) console.info('[Kawaii Sushi] Interação:', event.stationId, event.kind, event.success); } });
      this.session = new SessionState(() => {
        this.previousTime = null;
        this.input.setEnabled(!this.session.paused);
        if (!this.session.paused) {
          const player = this.world.player;
          if (!player.movementLocked && player.dashRemaining <= 0) player.stopMoving();
          this.renderer.domElement.focus({ preventScroll: true });
        }
        this.pauseUI?.render();
        this.container.dataset.paused = String(this.session.paused);
      });
      this.pauseUI = new PauseUI(container, this.session, onMainMenu);
      this.container.dataset.paused = 'true';
      this.resize = this.resize.bind(this); this.tick = this.tick.bind(this);
      this.handleVisibility = () => {
        this.previousTime = null; this.input.reset();
        // Foco de janela não é pausa. Apenas ocultar a aba exige suspensão automática.
        if (document.hidden) this.session.pause();
      };
      container.appendChild(this.renderer.domElement);
      window.addEventListener('resize', this.resize);
      document.addEventListener('visibilitychange', this.handleVisibility);
      this.resize();
    } catch (error) { this.dispose(); throw error; }
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true; this.input.setEnabled(!this.session.paused); this.previousTime = null;
    this.frameId = requestAnimationFrame(this.tick);
  }

  // Uma única porta de atualização: pausa congela física, animações e todos os relógios.
  updateSimulation(frameDelta) {
    if (this.session.paused || document.hidden || this.disposed) return;
    const deltaTime = Number.isFinite(frameDelta) ? Math.max(0, Math.min(frameDelta, 0.05)) : 0;
    const elapsed = Number.isFinite(frameDelta) ? Math.max(0, frameDelta) : 0;
    const wasCutting = this.preparation.isCutting;
    this.input.setActionsBlocked(wasCutting);
    const wasDashing = this.world.player.dashRemaining > 0;
    const interactPressed = this.input.consumeInteraction();
    const direction = this.input.getDirection(); const dashPressed = this.input.consumeDash();
    this.preparation.updatePreparation(elapsed);
    this.customerSystem.update(elapsed);
    this.world.update(deltaTime, wasCutting ? null : direction, wasCutting ? false : dashPressed);
    this.interactionSystem.update(deltaTime, this.world.player, { interactPressed: !wasCutting && interactPressed, disabled: wasDashing });
    this.input.setActionsBlocked(this.preparation.isCutting);
    this.preparation.updateAssembly(elapsed, { selectedStation: this.interactionSystem.activeStation,
      cancelHeld: this.input.isCancelHeld(), disabled: wasDashing || wasCutting });
  }

  tick(time) {
    if (!this.running) return;
    // Agenda antes das atualizações: uma exceção não pode cancelar a cadeia de quadros.
    this.frameId = requestAnimationFrame(this.tick);
    const delta = this.previousTime === null ? 0 : Math.max(0, (time - this.previousTime) / 1000);
    this.previousTime = this.session.paused || document.hidden ? null : time;
    this.updateSimulation(delta);
    if (!this.session.paused && !document.hidden) {
      this.collisionSystem.updateDebug(this.world.scene, this.world.player.collider, this.collisionDebug);
      this.preparation.updateUI(this.camera.camera, this.interactionSystem.activeStation);
      this.updateOrderUI();
    }
    this.renderer.render(this.world.scene, this.camera.camera);
  }

  updateOrderUI() {
    try {
      this.orderUI.update(this.orderSystem, this.customerSystem.customers);
      this.orderUIError = null;
    } catch (error) {
      // A apresentação não controla física, teclado ou pausa. Relata a falha sem perder o render.
      const signature = `${error?.message ?? error}\n${error?.stack ?? ''}`;
      if (this.orderUIError !== signature) {
        console.error('[Kawaii Sushi] Falha no HUD de pedidos; a partida continua ativa.', error);
        this.orderUIError = signature;
      }
    }
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1), height = Math.max(this.container.clientHeight, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setSize(width, height); this.camera.resize(width, height);
  }
  stop() {
    this.running = false; this.input?.setEnabled(false); this.preparation?.cancelCuts(); this.preparation?.resetCancellation();
    this.world?.player.stopMoving(); this.interactionSystem?.reset();
    cancelAnimationFrame(this.frameId); this.frameId = null; this.previousTime = null;
  }
  dispose() {
    if (this.disposed) return;
    this.stop(); this.disposed = true;
    window.removeEventListener('resize', this.resize); document.removeEventListener('visibilitychange', this.handleVisibility);
    this.pauseUI?.dispose(); this.input?.dispose(); this.interactionSystem?.dispose(); this.interactionUI?.dispose();
    this.preparation?.dispose(); this.sound?.dispose(); this.carrySystem?.dispose(); this.sushiFactory?.dispose(); this.ingredientFactory?.dispose();
    this.customerSystem?.dispose(); this.orderUI?.dispose(); this.collisionSystem?.dispose(); this.world?.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove(); delete this.container.dataset.paused;
  }
}

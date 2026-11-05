import { PCFSoftShadowMap, WebGLRenderer } from 'three';
import { Camera } from './Camera.js';
import { Scene } from './Scene.js';
import { Input } from './Input.js';
import { CollisionSystem } from './CollisionSystem.js';
import { InteractionSystem } from './InteractionSystem.js';
import { InteractionUI } from './InteractionUI.js';
import { IngredientFactory } from './IngredientFactory.js';
import { CarrySystem } from './CarrySystem.js';
import { RiceCookerSystem } from './RiceCookerSystem.js';
import { RiceCookerEffects } from './RiceCookerEffects.js';
import { RiceCookerUI } from './RiceCookerUI.js';
import { CuttingSystem } from './CuttingSystem.js';
import { CuttingEffects } from './CuttingEffects.js';
import { CuttingUI } from './CuttingUI.js';
import { SoundSystem } from './SoundSystem.js';
import { SushiFactory } from './SushiFactory.js';
import { AssemblySystem } from './AssemblySystem.js';
import { AssemblyUI } from './AssemblyUI.js';

export class Game {
  constructor(container) {
    if (!container) throw new Error('Contêiner #app não encontrado.');

    this.container = container;
    this.running = false;
    this.disposed = false;
    this.frameId = null;
    this.previousTime = null;
    this.renderer = new WebGLRenderer({ antialias: true });

    try {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
      this.renderer.domElement.setAttribute('aria-label', 'Hello Kitty 3D na cozinha japonesa Kawaii Sushi em perspectiva isométrica');
      this.renderer.domElement.setAttribute('role', 'img');
      this.world = new Scene();
      this.collisionSystem = new CollisionSystem({ bounds: this.world.collisionBounds });
      this.world.collisionObstacles.forEach((obstacle) => this.collisionSystem.registerObstacle(obstacle));
      this.world.player.collisionSystem = this.collisionSystem;
      this.collisionDebug = new URLSearchParams(window.location.search).get('debugCollisions') === '1';
      this.camera = new Camera(container.clientWidth, container.clientHeight, this.world.bounds);
      this.input = new Input(this.camera.camera);
      this.interactionUI = new InteractionUI(container);
      this.ingredientFactory = new IngredientFactory();
      this.carrySystem = new CarrySystem({ player: this.world.player, stations: this.world.kitchen.stations, factory: this.ingredientFactory });
      const riceStation = this.world.kitchen.stations.get('riceCooker');
      this.riceCooker = new RiceCookerSystem({ station: riceStation, carrySystem: this.carrySystem,
        factory: this.ingredientFactory, effects: new RiceCookerEffects(riceStation) });
      this.riceCookerUI = new RiceCookerUI(container, riceStation);
      this.sound = new SoundSystem();
      const cuttingStation = this.world.kitchen.stations.get('cutting');
      this.cuttingSystem = new CuttingSystem({ station: cuttingStation, player: this.world.player,
        carrySystem: this.carrySystem, factory: this.ingredientFactory,
        effects: new CuttingEffects(cuttingStation), sound: this.sound });
      this.cuttingUI = new CuttingUI(container, cuttingStation);
      this.sushiFactory = new SushiFactory();
      this.assemblySystem = new AssemblySystem({ station: this.world.kitchen.stations.get('assembly'),
        carrySystem: this.carrySystem, factory: this.sushiFactory });
      this.assemblyUI = new AssemblyUI(container);
      this.interactionSystem = new InteractionSystem({
        stations: this.world.kitchen.stations.values(),
        collisionSystem: this.collisionSystem,
        ui: this.interactionUI,
        carrySystem: this.carrySystem,
        onInteract: (event) => {
          if (import.meta.env.DEV) console.info('[Kawaii Sushi] Interação:', event.stationId, event.action, event.kind, event.success);
        },
      });
      this.interactionsSuspended = document.hidden;
      this.resize = this.resize.bind(this);
      this.tick = this.tick.bind(this);
      this.handleVisibility = (event) => {
        this.previousTime = null;
        this.input.reset();
        this.world.player.stopMoving();
        this.cuttingSystem.cancelStroke();
        this.assemblySystem.resetCancellation();
        this.interactionsSuspended = document.hidden || event.type === 'blur'
          || (event.type !== 'focus' && !document.hasFocus());
        this.interactionSystem.reset();
      };
      container.appendChild(this.renderer.domElement);
      window.addEventListener('resize', this.resize);
      document.addEventListener('visibilitychange', this.handleVisibility);
      window.addEventListener('blur', this.handleVisibility);
      window.addEventListener('focus', this.handleVisibility);
      this.resize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.input.setEnabled(true);
    this.previousTime = null;
    this.frameId = requestAnimationFrame(this.tick);
  }

  tick(time) {
    if (!this.running) return;
    const frameDelta = this.previousTime === null ? 0 : Math.max((time - this.previousTime) / 1000, 0);
    const deltaTime = Number.isFinite(frameDelta) ? Math.min(frameDelta, 0.05) : 0;
    this.previousTime = time;
    const wasCutting = this.cuttingSystem.isCutting;
    this.input.setActionsBlocked(wasCutting);
    const wasDashing = this.world.player.dashRemaining > 0;
    const interactPressed = this.input.consumeInteraction();
    const direction = this.input.getDirection();
    const dashPressed = this.input.consumeDash();
    this.riceCooker.update(document.hidden ? 0 : frameDelta);
    this.cuttingSystem.update(document.hidden ? 0 : frameDelta);
    this.world.update(deltaTime, wasCutting ? null : direction, wasCutting ? false : dashPressed);
    this.interactionSystem.update(deltaTime, this.world.player, {
      interactPressed: !wasCutting && interactPressed, disabled: wasDashing || this.interactionsSuspended,
    });
    this.input.setActionsBlocked(this.cuttingSystem.isCutting);
    const assemblySelected = this.interactionSystem.activeStation === this.assemblySystem.station;
    this.assemblySystem.update(document.hidden ? 0 : frameDelta, { selected: assemblySelected,
      cancelHeld: this.input.isCancelHeld(), disabled: wasDashing || this.interactionsSuspended || wasCutting });
    this.assemblyUI.update(this.assemblySystem, assemblySelected);
    this.collisionSystem.updateDebug(this.world.scene, this.world.player.collider, this.collisionDebug);
    this.riceCookerUI.update(this.riceCooker, this.camera.camera);
    this.cuttingUI.update(this.cuttingSystem, this.camera.camera);
    this.renderer.render(this.world.scene, this.camera.camera);
    this.frameId = requestAnimationFrame(this.tick);
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.camera.resize(width, height);
  }

  stop() {
    this.running = false;
    this.input?.setEnabled(false);
    this.cuttingSystem?.cancelStroke();
    this.assemblySystem?.resetCancellation();
    this.world?.player.stopMoving();
    this.interactionSystem?.reset();
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.previousTime = null;
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleVisibility);
    window.removeEventListener('focus', this.handleVisibility);
    this.input?.dispose();
    this.interactionSystem?.dispose();
    this.interactionUI?.dispose();
    this.riceCookerUI?.dispose();
    this.riceCooker?.dispose();
    this.cuttingUI?.dispose();
    this.cuttingSystem?.dispose();
    this.assemblyUI?.dispose();
    this.assemblySystem?.dispose();
    this.sound?.dispose();
    this.carrySystem?.dispose();
    this.sushiFactory?.dispose();
    this.ingredientFactory?.dispose();
    this.collisionSystem?.dispose();
    this.world?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.disposed = true;
  }
}

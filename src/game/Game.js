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
import { DeliverySystem } from './DeliverySystem.js';
import { ScoreSystem } from './ScoreSystem.js';
import { ScoreUI } from './ScoreUI.js';
import { RecipeBookUI } from './RecipeBookUI.js';
import { ControlSettings } from './ControlSettings.js';
import { GameTimer } from './GameTimer.js';
import { GameResults } from './GameResults.js';
import { ResultsUI } from './ResultsUI.js';
import { BALANCE } from './Balance.js';
import { PLAYER_CONTROLS } from './PlayerControls.js';
import { DifficultySystem } from './DifficultySystem.js';
import { FireSystem } from './FireSystem.js';
import { FireEffects } from './FireEffects.js';
import { FireExtinguisher } from './FireExtinguisher.js';
import { FireUI } from './FireUI.js';
import { QuestionSystem } from './QuestionSystem.js';
import { QuestionUI } from './QuestionUI.js';

export class Game {
  constructor(container, { onMainMenu = () => window.location.reload(), controlSettings = null, gameMode = 'solo', cameraConfig = {} } = {}) {
    if (!container) throw new Error('Contêiner #app não encontrado.');
    this.gameMode = gameMode === 'coop' ? 'coop' : 'solo';
    this.container = container; this.onMainMenu = onMainMenu;
    this.running = false; this.disposed = false; this.frameId = null; this.previousTime = null;
    this.renderer = new WebGLRenderer({ antialias: true });
    try {
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFShadowMap;
      this.renderer.domElement.setAttribute('aria-label', 'Hello Kitty Sushi: cozinha 3D com câmera frontal elevada');
      this.renderer.domElement.setAttribute('role', 'img'); this.renderer.domElement.tabIndex = 0;
      this.world = new Scene({ gameMode: this.gameMode });
      this.extinguisher = new FireExtinguisher({ scene: this.world.scene });
      this.interactiveStations = new Map(this.world.kitchen.stations);
      this.interactiveStations.set(this.extinguisher.station.id, this.extinguisher.station);
      this.interactiveStations.set(this.extinguisher.floorStation.id, this.extinguisher.floorStation);
      this.collisionSystem = new CollisionSystem({ bounds: this.world.collisionBounds });
      this.world.collisionObstacles.forEach(obstacle => this.collisionSystem.registerObstacle(obstacle));
      this.collisionSystem.registerObstacle(this.extinguisher.station.collider);
      this.extinguisher.configureWorld(this.collisionSystem);
      this.collisionSystem.players = this.world.players;
      for (const player of this.world.players) player.collisionSystem = this.collisionSystem;
      this.collisionDebug = new URLSearchParams(window.location.search).get('debugCollisions') === '1';
      this.difficulty = new DifficultySystem({ gameMode: this.gameMode,
        elapsed: () => this.gameTimer ? this.gameTimer.config.duration - this.gameTimer.remaining : 0 });
      this.customerSystem = new CustomerSystem({ scene: this.world.scene,
        delivery: this.world.kitchen.stations.get('delivery'), collisionSystem: this.collisionSystem,
        architecture: this.world.architecture, difficulty: this.difficulty, areaWidth: this.world.dimensions.width });
      this.world.refreshArchitectureColliders(this.collisionSystem);
      this.world.bounds.union(this.customerSystem.bounds);
      this.orderSystem = this.customerSystem.orderSystem;
      this.orderUI = new OrderUI(container);
      this.camera = new Camera(container.clientWidth, container.clientHeight, this.world.bounds, cameraConfig);
      let storage = null; try { storage = window.localStorage; } catch { /* Preferência em memória. */ }
      this.controlSettings = controlSettings ?? new ControlSettings({ storage });
      this.input = new Input(this.camera.camera, { settings: this.controlSettings, player: this.world.player,
        navigationCanvas: this.renderer.domElement, scene: this.world.scene,
        navigationObstacles: [...this.world.collisionObstacles, this.extinguisher.station.collider, this.extinguisher.floorStation.collider],
        controls: this.gameMode === 'coop' ? PLAYER_CONTROLS.p1 : PLAYER_CONTROLS.solo });
      this.interactionUI = new InteractionUI(container, { playerId: this.gameMode === 'coop' ? 'player' : null });
      this.ingredientFactory = new IngredientFactory(); this.sushiFactory = new SushiFactory();
      this.carrySystem = new CarrySystem({ player: this.world.player, stations: this.interactiveStations, factory: this.ingredientFactory });
      this.sound = new SoundSystem();
      this.preparation = new PreparationSystem({ stations: this.world.kitchen.stations, carrySystem: this.carrySystem,
        factory: this.ingredientFactory, sushiFactory: this.sushiFactory, sound: this.sound, container });
      this.scoreUI = new ScoreUI(container);
      this.scoreSystem = new ScoreSystem(event => this.scoreUI.render(event));
      this.gameTimer = new GameTimer();
      this.results = new GameResults();
      this.resultsUI = new ResultsUI(container, () => this.restart(), onMainMenu);
      this.resultsUI.update(this.gameTimer);
      const canChange = operation => !this.disposed && (this.session?.mode === 'PLAYING' || (operation === 'question'
        && this.session?.mode === 'QUESTION' && this.questionSystem?.active?.phase === 'RESOLVING'));
      this.scoreSystem.canChange = canChange;
      this.orderSystem.canChange = canChange;
      this.orderSystem.onCreated = order => this.results.record('generated', order);
      this.orderSystem.onCompleted = order => this.results.record('delivered', order);
      this.orderSystem.onRejected = order => this.results.record('incorrect', order);
      this.orderSystem.onExpired = order => { this.results.record('expired', order); this.scoreSystem.expire(order); this.sound.playExpired(); };
      this.scoreSystem.onIncorrect = () => this.results.record('incorrect');
      this.questionSystem = new QuestionSystem({ elapsed: () => this.gameTimer.config.duration - this.gameTimer.remaining });
      this.deliverySystem = new DeliverySystem({ station: this.world.kitchen.stations.get('delivery'), questionSystem: this.questionSystem,
        carrySystem: this.carrySystem, customerSystem: this.customerSystem, scoreSystem: this.scoreSystem,
        sound: this.sound, isPaused: () => !this.session || this.session.paused || document.hidden || this.disposed });
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
      this.fireSystem = new FireSystem({ stations: this.world.kitchen.stations, extinguisher: this.extinguisher,
        effects: new FireEffects(this.world.scene), sound: this.sound, collisionSystem: this.collisionSystem });
      this.fireUI = new FireUI(container);
      this.interactionSystem = new InteractionSystem({ stations: this.interactiveStations.values(),
        collisionSystem: this.collisionSystem, ui: this.interactionUI, carrySystem: this.carrySystem, fireSystem: this.fireSystem,
        onInteract: event => { if (import.meta.env.DEV) console.info('[Hello Kitty Sushi] Interação:', event.stationId, event.kind, event.success); } });
      this.input.mouseNavigation.interactions = this.interactionSystem;
      this.players = [{ player: this.world.player, input: this.input, carrySystem: this.carrySystem, interactionSystem: this.interactionSystem, interactionUI: this.interactionUI }];
      for (const player of this.world.players.slice(1)) {
        const input = new Input(this.camera.camera, { settings: this.controlSettings, player, controls: PLAYER_CONTROLS.p2 });
        const carrySystem = new CarrySystem({ player, stations: this.interactiveStations, factory: this.ingredientFactory });
        const interactionUI = new InteractionUI(container, { playerId: player.id, keyLabel: 'P' });
        const interactionSystem = new InteractionSystem({ stations: this.interactiveStations.values(), collisionSystem: this.collisionSystem, ui: interactionUI, carrySystem, fireSystem: this.fireSystem });
        this.players.push({ player, input, carrySystem, interactionSystem, interactionUI });
      }
      this.markerPosition = this.world.player.group.position.clone();
      if (this.gameMode === 'coop') for (const context of this.players) {
        context.label = document.createElement('span'); context.label.className = 'player-marker';
        context.label.dataset.player = context.player.id; context.label.textContent = context.player.id === 'p2' ? 'P2' : 'P1'; container.append(context.label);
      }
      this.session = new SessionState(() => {
        this.previousTime = null;
        if (this.session.paused) this.fireSystem?.stopAllSpraying();
        for (const context of this.activePlayers) context.input.setEnabled(!this.session.paused);
        if (!this.session.paused) {
          for (const { player } of this.activePlayers) if (!player.movementLocked && player.dashRemaining <= 0) player.stopMoving();
          this.renderer.domElement.focus({ preventScroll: true });
        }
        this.pauseUI?.render();
        this.container.dataset.paused = String(this.session.paused);
      });
      this.pauseUI = new PauseUI(container, this.session, onMainMenu, this.controlSettings, this.gameMode,
        () => this.players.every(({ player }) => !player.movementLocked), this.camera);
      this.recipeBookUI = new RecipeBookUI(container, this.session);
      this.questionSystem.session = this.session;
      this.questionUI = new QuestionUI(container, this.questionSystem, { gameMode: this.gameMode,
        onClose: () => this.activePlayers.forEach(context => context.interactionSystem.reset()) });
      this.container.dataset.paused = 'true';
      this.resize = this.resize.bind(this); this.tick = this.tick.bind(this);
      this.handleVisibility = () => {
        this.previousTime = null; for (const context of this.activePlayers) context.input.reset();
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
    this.running = true; for (const context of this.activePlayers) context.input.setEnabled(!this.session.paused); this.previousTime = null;
    this.frameId = requestAnimationFrame(this.tick);
  }

  // Uma única porta de atualização: pausa congela física, animações e todos os relógios.
  updateSimulation(frameDelta) {
    if (this.session.paused || document.hidden || this.disposed) return;
    if (this.gameTimer?.update(frameDelta)) { this.finish(); return; }
    if (this.gameTimer) this.resultsUI.update(this.gameTimer);
    const deltaTime = Number.isFinite(frameDelta) ? Math.max(0, Math.min(frameDelta, 0.05)) : 0;
    const elapsed = Number.isFinite(frameDelta) ? Math.max(0, frameDelta) : 0;
    this.world.exterior?.update(deltaTime);
    this.preparation.updatePreparation(elapsed);
    this.fireSystem?.update(elapsed);
    this.deliverySystem?.update(elapsed); this.scoreUI?.update(elapsed); this.customerSystem.update(elapsed);
    this.fireSystem?.updateActions(deltaTime, this.activePlayers);
    if (this.fireUI) this.fireUI.update(elapsed, this.fireSystem);
    // Ordem P1/P2: mutações síncronas com revalidação a cada ação.
    const actions = this.activePlayers.map(context => {
      const { player, input } = context;
      const locked = player.movementLocked;
      input.setActionsBlocked(locked);
      player.autoFaceMovement = this.controlSettings?.movementMode !== 'character';
      return { ...context, locked, direction: input.getDirection().clone(), dash: input.consumeDash(), interact: input.consumeInteraction(), wasDashing: player.dashRemaining > 0 };
    });
    const steps = Math.max(1, Math.ceil(deltaTime * 120));
    for (let i = 0; i < steps; i++) for (const action of actions) {
      const { player, input, locked } = action;
      const step = deltaTime / steps;
      const turn = !locked ? (input.getTurn?.() ?? 0) * BALANCE.player.characterTurnSpeed * step : 0;
      player.group.rotation.y += turn / 2;
      const previousCooldown = player.cooldownRemaining;
      player.update(step, locked ? null : player.autoFaceMovement ? action.direction : input.getDirection(), !locked && i === 0 && action.dash);
      player.group.rotation.y += turn / 2;
      if (i === 0 && player.cooldownRemaining > previousCooldown) this.sound?.playDash?.();
    }
    for (const action of actions) {
      const event = action.interactionSystem.update(deltaTime, action.player, { interactPressed: !action.locked && action.interact,
        interactHeld: action.input.isInteractionHeld(), interactionEpoch: action.input.interactionEpoch,
        disabled: action.wasDashing, preferredStation: action.input.mouseNavigation?.station });
      if (event?.success) this.sound?.playInteraction?.(event.kind);
      if (this.questionSystem?.busy) return; // A first delivery pauses both players before the second can interact.
      action.input.setActionsBlocked(action.player.movementLocked);
    }
    for (const system of this.preparation.assemblySystems?.values() ?? []) {
      const actor = actions.find(a => a.interactionSystem.activeStation === system.station && a.input.isCancelHeld() && !a.carrySystem.carriedIngredient && !a.player.movementLocked && a.player.dashRemaining <= 0);
      if (actor) {
        if (system.station.interactingPlayer && system.station.interactingPlayer !== actor.player) system.resetCancellation();
        system.carrySystem = actor.carrySystem;
      }
      system.update(elapsed, { selected: Boolean(actor), cancelHeld: Boolean(actor), disabled: !actor });
    }
  }

  get activePlayers() {
    return this.players ?? [{ player: this.world.player, input: this.input, carrySystem: this.carrySystem, interactionSystem: this.interactionSystem }];
  }

  tick(time) {
    if (!this.running) return;
    // Agenda antes das atualizações: uma exceção não pode cancelar a cadeia de quadros.
    this.frameId = requestAnimationFrame(this.tick);
    this.questionSystem?.update();
    const delta = this.previousTime === null ? 0 : Math.max(0, (time - this.previousTime) / 1000);
    this.previousTime = this.session.paused || document.hidden ? null : time;
    this.updateSimulation(delta);
    if (!this.session.paused && !document.hidden) {
      this.collisionSystem.updateDebug(this.world.scene, this.world.player.collider, this.collisionDebug);
      const assemblyActor = this.activePlayers.find(({ interactionSystem }) => interactionSystem.activeStation?.type === 'assembly');
      this.preparation.updateUI(this.camera.camera, assemblyActor?.interactionSystem.activeStation,
        assemblyActor?.carrySystem);
      this.updateOrderUI();
      const first = this.players?.[0];
      for (const context of this.players ?? []) if (context.label) {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const point = this.markerPosition.copy(context.player.group.position);
        point.y += 3.2 * context.player.modelScale;
        point.project(this.camera.camera);
        let x = Math.max(20, Math.min(width - 20, (point.x + 1) * width / 2));
        let y = Math.max(24, (1 - point.y) * height / 2);
        if (context !== first && Math.abs(x - first.markerX) < 40 && Math.abs(y - first.markerY) < 24) {
          if (y >= 48) y -= 24;
          else x = first.markerX < width / 2 ? first.markerX + 40 : first.markerX - 40;
        }
        context.markerX = x;
        context.markerY = y;
        context.label.style.left = x + 'px';
        context.label.style.top = y + 'px';
      }
    }
    this.renderer.render(this.world.scene, this.camera.camera);
  }

  finish() {
    if (this.session.mode === 'FINISHED' || this.disposed) return;
    this.questionSystem?.cancel({ resume: false });
    this.session.finish();
    for (const { player, input, interactionSystem } of this.activePlayers) { player.stopMoving(); input.setEnabled(false); interactionSystem.reset(); }
    this.recipeBookUI.button.disabled = true;
    this.resultsUI.update(this.gameTimer);
    this.resultsUI.show(this.results.finish(this.scoreSystem.score));
  }

  restart() {
    if (this.session.mode !== 'FINISHED' || this.disposed) return;
    const settings = this.controlSettings, container = this.container, onMainMenu = this.onMainMenu;
    const cameraConfig = { ...this.camera.settings };
    this.dispose();
    const fresh = new Game(container, { onMainMenu, controlSettings: settings, gameMode: this.gameMode, cameraConfig });
    this.nextGame = fresh;
    this.dispose = () => fresh.dispose();
    fresh.controlSettings.setMovementMode(settings.movementMode);
    fresh.session.play(); fresh.start();
    return fresh;
  }

  updateOrderUI() {
    try {
      this.orderUI.update(this.orderSystem, this.customerSystem.customers);
      this.orderUIError = null;
    } catch (error) {
      // A apresentação não controla física, teclado ou pausa. Relata a falha sem perder o render.
      const signature = `${error?.message ?? error}\n${error?.stack ?? ''}`;
      if (this.orderUIError !== signature) {
        console.error('[Hello Kitty Sushi] Falha no HUD de pedidos; a partida continua ativa.', error);
        this.orderUIError = signature;
      }
    }
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1), height = Math.max(this.container.clientHeight, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setSize(width, height); this.camera.resize(width, height);
  }
  stop() {
    this.fireSystem?.stopAllSpraying();
    this.running = false; this.input?.setEnabled(false); this.preparation?.cancelCuts(); this.preparation?.resetCancellation();
    for (const context of this.players ?? []) { context.player.stopMoving(); context.input.setEnabled(false); context.interactionSystem.reset(); }
    cancelAnimationFrame(this.frameId); this.frameId = null; this.previousTime = null;
  }
  dispose() {
    if (this.disposed) return;
    this.stop(); this.disposed = true;
    window.removeEventListener('resize', this.resize); document.removeEventListener('visibilitychange', this.handleVisibility);
    this.recipeBookUI?.dispose(); this.pauseUI?.dispose(); this.input?.dispose(); this.interactionSystem?.dispose(); this.interactionUI?.dispose();
    for (const context of this.players?.slice(1) ?? []) { context.input.dispose(); context.interactionSystem.dispose(); context.interactionUI.dispose(); context.carrySystem.dispose(); }
    for (const context of this.players ?? []) context.label?.remove();
    this.resultsUI?.dispose();
    this.deliverySystem?.dispose(); this.questionUI?.dispose(); this.scoreUI?.dispose();
    this.fireSystem?.dispose(); this.fireUI?.dispose(); this.extinguisher?.dispose();
    this.preparation?.dispose(); this.sound?.dispose(); this.carrySystem?.dispose(); this.sushiFactory?.dispose(); this.ingredientFactory?.dispose();
    this.customerSystem?.dispose(); this.orderUI?.dispose(); this.collisionSystem?.dispose(); this.world?.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove(); delete this.container.dataset.paused;
  }
}

import { Vector3 } from 'three';
import { MouseNavigation } from './MouseNavigation.js';
import { MOVEMENT_MODES } from './ControlSettings.js';

import { PLAYER_CONTROLS } from './PlayerControls.js';

export class Input {
  constructor(camera, { target = window, documentTarget = document, settings = null, player = null, navigationCanvas = null, navigationObstacles = [], scene = null, controls = PLAYER_CONTROLS.solo } = {}) {
    this.controls = controls;
    const movementKeys = new Set([...controls.up, ...controls.down, ...controls.left, ...controls.right]);
    this.hasDirection = action => controls[action].some(code => this.keys.has(code));
    this.camera = camera; this.settings = settings; this.player = player;
    this.forward = new Vector3(); this.right = new Vector3();
    this.target = target;
    this.documentTarget = documentTarget;
    this.keys = new Set();
    this.suppressedKeys = new Set();
    this.actionsBlocked = false;
    this.dashPressed = false;
    this.interactionPressed = false;
    this.enabled = false;
    this.disposed = false;
    this.direction = new Vector3();
    if (navigationCanvas) {
      this.mouseNavigation = new MouseNavigation(camera, navigationCanvas, player, scene, navigationObstacles);
      this.onPointerMove = event => this.mouseNavigation.track(event);
      this.onPointerOut = event => {
        if (event.pointerType === 'mouse' && !event.relatedTarget) {
          this.mouseNavigation.pointer = null;
          this.mouseNavigation.clearRoute();
        }
      };
      target.addEventListener('pointermove', this.onPointerMove);
      target.addEventListener('pointerover', this.onPointerMove);
      target.addEventListener('pointerout', this.onPointerOut);
    }

    this.onKeyDown = (event) => {
      if (!this.enabled || !(movementKeys.has(event.code) || [controls.dash, controls.interact, controls.cancel, controls.drop].includes(event.code))) return;
      if ((event.ctrlKey && controls === PLAYER_CONTROLS.solo) || event.metaKey || event.altKey || event.isComposing) return;
      if (event.target?.isContentEditable || event.target?.closest?.('input, textarea, select')) return;
      // As setas não devem rolar a página enquanto controlam o jogo.
      event.preventDefault();
      if (event.code === controls.drop && this.player?.extinguishing && !event.repeat && !this.keys.has(event.code)) {
        this.dropPressed = true; this.keys.add(event.code); return;
      }
      if (this.actionsBlocked && this.usesGPS && event.code === 'KeyW' && this.keys.has('KeyW')) return;
      if (this.actionsBlocked || this.suppressedKeys.has(event.code)) {
        this.suppressedKeys.add(event.code);
        return;
      }
      // Após pausar, uma tecla ainda segurada precisa ser solta antes de voltar a agir.
      if (event.repeat && !this.keys.has(event.code)) return;
      if (event.code === controls.dash && !event.repeat && !this.keys.has(event.code)) {
        this.dashPressed = this.getDirection().lengthSq() > 0;
      }
      if (event.code === controls.interact && !event.repeat && !this.keys.has(event.code)) this.interactionPressed = true;
      if (event.code === controls.drop && !event.repeat && !this.keys.has(event.code)) this.dropPressed = true;
      this.keys.add(event.code);
    };
    this.onKeyUp = (event) => {
      if (this.enabled && this.keys.has(event.code)) event.preventDefault();
      if (event.code === 'KeyW' && this.usesGPS && this.keys.has('KeyW')) this.stopNavigation();
      this.keys.delete(event.code);
      this.suppressedKeys.delete(event.code);
    };
    this.onBlur = event => {
      // Só uma perda real de foco da janela limpa teclas; eventos de elementos da UI não o fazem.
      if (event.target !== this.target) return;
      if (this.mouseNavigation) this.mouseNavigation.pointer = null;
      this.reset();
    };
    this.onVisibility = () => this.reset();
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    documentTarget.addEventListener('visibilitychange', this.onVisibility);
  }

  setEnabled(enabled) {
    this.enabled = enabled && !this.disposed;
    this.reset();
  }

  get usesGPS() {
    return Boolean(this.mouseNavigation && this.settings?.movementMode === MOVEMENT_MODES.GPS);
  }

  stopNavigation() {
    this.mouseNavigation?.clearRoute();
    this.player?.stopMoving();
    this.dashPressed = false;
  }

  getDirection() {
    this.direction.set(0, 0, 0);
    if (!this.enabled || this.actionsBlocked) return this.direction;
    if (this.usesGPS) {
      if (this.keys.has('KeyW')) return this.mouseNavigation.steer(this.direction);
      return this.direction;
    }

    const horizontal = Number(this.hasDirection('right'))
      - Number(this.hasDirection('left'));
    const vertical = Number(this.hasDirection('up'))
      - Number(this.hasDirection('down'));

    // Eixos fixos da cozinha: fundo -Z, frente +Z, esquerda -X, direita +X.
    const mode = this.settings?.movementMode ?? MOVEMENT_MODES.MAP;
    if (mode === MOVEMENT_MODES.CAMERA && this.camera) {
      this.camera.getWorldDirection(this.forward);
      this.forward.y = 0;
      if (this.forward.lengthSq() < 1e-8) this.forward.set(0, 0, -1);
      this.forward.normalize(); this.right.set(-this.forward.z, 0, this.forward.x);
      this.direction.copy(this.forward).multiplyScalar(vertical).addScaledVector(this.right, horizontal);
    } else if (mode === MOVEMENT_MODES.CHARACTER && this.player) {
      const angle = this.player.group.rotation.y;
      this.forward.set(Math.sin(angle), 0, Math.cos(angle));
      this.right.set(-Math.cos(angle), 0, Math.sin(angle));
      this.direction.copy(this.forward).multiplyScalar(vertical);
    } else this.direction.set(horizontal, 0, -vertical);
    // W+D tem o mesmo módulo que W: nenhuma vantagem de velocidade na diagonal.
    return this.direction.normalize();
  }

  getTurn() {
    if (!this.enabled || this.actionsBlocked || this.settings?.movementMode !== MOVEMENT_MODES.CHARACTER) return 0;
    return Number(this.hasDirection('left'))
      - Number(this.hasDirection('right'));
  }

  reset() {
    this.interactionEpoch = (this.interactionEpoch ?? 0) + 1;
    if (this.usesGPS && this.keys.has('KeyW')) this.stopNavigation();
    else this.mouseNavigation?.clearRoute();
    this.actionsBlocked = false;
    this.suppressedKeys.clear();
    this.dashPressed = false;
    this.interactionPressed = false;
    this.keys.clear();
    this.dropPressed = false;
    this.direction.set(0, 0, 0);
  }

  setActionsBlocked(blocked) {
    if (this.actionsBlocked === blocked) return;
    this.actionsBlocked = blocked;
    if (!blocked) return;
    if (this.usesGPS) this.stopNavigation();
    for (const code of this.keys) {
      if (this.usesGPS && code === 'KeyW') continue;
      if (this.player?.extinguishing && code === this.controls.interact) continue;
      this.suppressedKeys.add(code);
      this.keys.delete(code);
    }
    this.direction.set(0, 0, 0);
    this.dashPressed = false;
    this.interactionPressed = false;
  }

  consumeDash() {
    const pressed = this.dashPressed;
    this.dashPressed = false;
    return pressed;
  }

  isCancelHeld() {
    return this.enabled && !this.actionsBlocked && this.keys.has(this.controls.cancel);
  }

  isInteractionHeld() {
    return this.enabled && (!this.actionsBlocked || this.player?.extinguishing) && this.keys.has(this.controls.interact);
  }

  consumeInteraction() {
    const pressed = this.interactionPressed;
    this.interactionPressed = false;
    return pressed;
  }

  consumeDrop() { const pressed = Boolean(this.dropPressed); this.dropPressed = false; return pressed; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.setEnabled(false);
    if (this.mouseNavigation) {
      this.target.removeEventListener('pointermove', this.onPointerMove);
      this.target.removeEventListener('pointerover', this.onPointerMove);
      this.target.removeEventListener('pointerout', this.onPointerOut);
      this.mouseNavigation.dispose();
    }
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.documentTarget.removeEventListener('visibilitychange', this.onVisibility);
  }
}

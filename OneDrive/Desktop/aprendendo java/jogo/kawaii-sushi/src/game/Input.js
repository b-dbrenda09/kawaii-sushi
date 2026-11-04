import { Vector3 } from 'three';

const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
]);

export class Input {
  constructor(camera, { target = window, documentTarget = document } = {}) {
    this.camera = camera;
    this.target = target;
    this.documentTarget = documentTarget;
    this.keys = new Set();
    this.enabled = false;
    this.disposed = false;
    this.forward = new Vector3();
    this.right = new Vector3();
    this.up = new Vector3(0, 1, 0);
    this.direction = new Vector3();

    this.onKeyDown = (event) => {
      if (!this.enabled || !MOVEMENT_KEYS.has(event.code)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.target?.isContentEditable || event.target?.closest?.('input, textarea, select')) return;
      // As setas não devem rolar a página enquanto controlam o jogo.
      event.preventDefault();
      this.keys.add(event.code);
    };
    this.onKeyUp = (event) => {
      if (this.enabled && this.keys.has(event.code)) event.preventDefault();
      this.keys.delete(event.code);
    };
    this.onBlur = () => this.reset();
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

  getDirection() {
    this.direction.set(0, 0, 0);
    if (!this.enabled) return this.direction;

    const horizontal = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))
      - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const vertical = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'))
      - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    this.direction.addScaledVector(this.forward, vertical).addScaledVector(this.right, horizontal);
    // W+D tem o mesmo módulo que W: nenhuma vantagem de velocidade na diagonal.
    return this.direction.normalize();
  }

  reset() {
    this.keys.clear();
    this.direction.set(0, 0, 0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.setEnabled(false);
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.documentTarget.removeEventListener('visibilitychange', this.onVisibility);
  }
}

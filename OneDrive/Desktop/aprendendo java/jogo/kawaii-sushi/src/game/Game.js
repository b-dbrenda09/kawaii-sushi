import { PCFSoftShadowMap, WebGLRenderer } from 'three';
import { Camera } from './Camera.js';
import { Scene } from './Scene.js';
import { Input } from './Input.js';

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
      this.camera = new Camera(container.clientWidth, container.clientHeight, this.world.bounds);
      this.input = new Input(this.camera.camera);
      this.resize = this.resize.bind(this);
      this.tick = this.tick.bind(this);
      this.handleVisibility = () => {
        this.previousTime = null;
        this.input.reset();
        this.world.player.stopMoving();
      };
      container.appendChild(this.renderer.domElement);
      window.addEventListener('resize', this.resize);
      document.addEventListener('visibilitychange', this.handleVisibility);
      window.addEventListener('blur', this.handleVisibility);
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
    const deltaTime = this.previousTime === null ? 0 : Math.min(Math.max((time - this.previousTime) / 1000, 0), 0.05);
    this.previousTime = time;
    this.world.update(deltaTime, this.input.getDirection());
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
    this.world?.player.stopMoving();
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
    this.input?.dispose();
    this.world?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.disposed = true;
  }
}

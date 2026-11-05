import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene as ThreeScene,
} from 'three';
import { Player } from './Player.js';
import { Kitchen } from './Kitchen.js';

export class Scene {
  constructor() {
    this.scene = new ThreeScene();
    this.scene.background = new Color('#fce8ef');
    // Coordenadas jogáveis: x de -9 a 9, z de -7 a 7; piso em y = 0.
    this.dimensions = Object.freeze({ width: 18, depth: 14, wallHeight: 3.6 });
    this.architecture = new Group();
    this.architecture.name = 'kitchen-architecture';
    this.scene.add(this.architecture);
    this.materials = {
      foundation: new MeshStandardMaterial({ color: '#b88c6b', roughness: 0.95 }),
      wood: new MeshStandardMaterial({ color: '#b88462', roughness: 0.85 }),
      trim: new MeshStandardMaterial({ color: '#d5ab81', roughness: 0.85 }),
      plaster: new MeshStandardMaterial({ color: '#fff0d9', roughness: 1 }),
      paper: new MeshStandardMaterial({ color: '#fff8e9', roughness: 1 }),
      sage: new MeshStandardMaterial({ color: '#b9cbbb', roughness: 0.95 }),
      planks: ['#e4c49c', '#e8cba5', '#e2c098', '#edcfaa', '#e6c7a0'].map(
        (color) => new MeshStandardMaterial({ color, roughness: 0.95 }),
      ),
    };
    this.createFloor();
    this.createWalls();
    this.collisionBounds = Object.freeze({
      minX: -this.dimensions.width / 2, maxX: this.dimensions.width / 2,
      minZ: -this.dimensions.depth / 2, maxZ: this.dimensions.depth / 2,
    });
    // Volumes sólidos na altura do corpo. Travessas e painéis elevados são decorativos.
    this.collisionObstacles = [];
    this.architecture.updateMatrixWorld(true);
    for (const object of this.architecture.children) {
      if (!/^(back-wall|left-wall|right-low-wall|.*-skirting|back-post-.*|left-post-.*|right-wall-cap)$/.test(object.name)) continue;
      const box = new Box3().setFromObject(object);
      this.collisionObstacles.push({ id: object.name, bounds: {
        minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z,
      } });
    }
    // Limite lógico da frente aberta, sem adicionar parede visível.
    this.collisionObstacles.push({ id: 'front-boundary', position: { x: 0, z: this.dimensions.depth / 2 + 0.1 },
      width: this.dimensions.width + 0.4, depth: 0.2 });
    this.kitchen = new Kitchen();
    this.scene.add(this.kitchen.group);
    this.collisionObstacles.push(...this.kitchen.colliders);
    // Enquadramento da arquitetura e dos equipamentos, sem a posição das luzes.
    this.bounds = new Box3().setFromObject(this.architecture);
    this.bounds.union(new Box3().setFromObject(this.kitchen.group));
    this.createLighting();
    this.player = new Player({ position: this.kitchen.spawnPosition });
    this.scene.add(this.player.group);
  }

  box(name, size, position, material, castShadow = true) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.architecture.add(mesh);
    return mesh;
  }

  createFloor() {
    const { width, depth } = this.dimensions;
    this.box('floor-foundation', [width + 0.5, 0.36, depth + 0.5], [0, -0.25, 0], this.materials.foundation);
    // Juntas de 0,018 unidade e emendas alternadas, sem texturas externas.
    for (let row = 0; row < depth; row++) {
      let start = -width / 2;
      let index = 0;
      while (start < width / 2) {
        const length = Math.min(index === 0 && row % 2 ? 1.5 : 3, width / 2 - start);
        this.box(`floor-plank-${row}-${index}`, [length - 0.018, 0.08, 0.982],
          [start + length / 2, -0.04, -depth / 2 + row + 0.5],
          this.materials.planks[(row * 3 + index) % this.materials.planks.length], false);
        start += length;
        index++;
      }
    }
    this.box('front-floor-edge', [18.5, 0.13, 0.12], [0, -0.03, 7.15], this.materials.trim, false);
  }

  createWalls() {
    const { plaster, wood, trim, paper, sage } = this.materials;
    const height = this.dimensions.wallHeight;
    this.box('back-wall', [18.4, height, 0.22], [0, height / 2, -7.11], plaster);
    this.box('left-wall', [0.22, height, 14.2], [-9.11, height / 2, 0], plaster);
    // Parede próxima rebaixada para manter os corredores visíveis.
    this.box('right-low-wall', [0.22, 0.65, 14.2], [9.11, 0.325, 0], plaster);

    this.box('back-skirting', [18.4, 0.24, 0.12], [0, 0.12, -6.94], wood);
    this.box('left-skirting', [0.12, 0.24, 14], [-8.94, 0.12, 0], wood);
    this.box('right-skirting', [0.12, 0.18, 14], [8.94, 0.09, 0], wood);
    this.box('back-beam', [18.6, 0.22, 0.36], [0, height, -7.1], wood);
    this.box('left-beam', [0.36, 0.22, 14.3], [-9.1, height, 0], wood);
    this.box('right-wall-cap', [0.34, 0.1, 14.3], [9.11, 0.68, 0], trim);

    for (const x of [-9, -4.5, 0, 4.5, 9]) {
      this.box(`back-post-${x}`, [0.18, height, 0.28], [x, height / 2, -7], wood);
    }
    for (const z of [-2.4, 2.3, 7]) {
      this.box(`left-post-${z}`, [0.28, height, 0.18], [-9, height / 2, z], wood);
    }

    // Painéis shoji decorativos embutidos na parede do fundo.
    for (const center of [-6.75, -2.25, 2.25, 6.75]) {
      this.box(`shoji-paper-${center}`, [3.6, 1.65, 0.06], [center, 2.24, -6.95], paper, false);
      for (const offset of [-1.8, -0.6, 0.6, 1.8]) {
        this.box(`shoji-upright-${center}-${offset}`, [0.055, 1.72, 0.08],
          [center + offset, 2.24, -6.89], trim, false);
      }
      for (const y of [1.4, 1.96, 2.52, 3.08]) {
        this.box(`shoji-rail-${center}-${y}`, [3.65, 0.055, 0.08], [center, y, -6.89], trim, false);
      }
    }
    // Faixa discreta na lateral, sem ocupar espaço de circulação.
    for (const z of [-4.75, 0, 4.65]) {
      this.box(`left-inset-${z}`, [0.04, 1.15, 3.7], [-8.97, 2.15, z], sage, false);
      for (const y of [1.55, 2.75]) {
        this.box(`left-inset-rail-${z}-${y}`, [0.09, 0.065, 3.8], [-8.92, y, z], trim, false);
      }
    }
  }

  createLighting() {
    this.scene.add(new AmbientLight('#fff3e5', 2));
    const sunlight = new DirectionalLight('#fff0d6', 2.5);
    sunlight.position.set(3, 16, 10);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -16;
    sunlight.shadow.camera.right = 16;
    sunlight.shadow.camera.top = 16;
    sunlight.shadow.camera.bottom = -16;
    sunlight.shadow.camera.near = 0.5;
    sunlight.shadow.camera.far = 50;
    sunlight.shadow.normalBias = 0.04;
    sunlight.shadow.intensity = 0.35;
    this.scene.add(sunlight);
  }

  update(deltaTime, direction = null, dashPressed = false) {
    this.player.update(deltaTime, direction, dashPressed);
  }

  dispose() {
    // Player possui e libera seus próprios recursos antes da limpeza da arquitetura.
    this.player?.dispose();
    const geometries = new Set();
    const materials = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => materials.add(material));
      }
      object.shadow?.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.scene.clear();
  }
}

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
import { KITCHEN_LAYOUT } from './KitchenLayout.js';
import { ExteriorDecoration } from './ExteriorDecoration.js';

export class Scene {
  constructor({ gameMode = 'solo', layout = KITCHEN_LAYOUT } = {}) {
    this.scene = new ThreeScene();
    this.scene.background = new Color('#fce8ef');
    // Physical dimensions are configured centrally; the floor stays at y = 0.
    this.baseWidth = layout.baseWidth;
    this.sideExpansion = (layout.width - layout.baseWidth) / 2;
    this.dimensions = Object.freeze({ width: layout.width, depth: layout.depth, wallHeight: layout.wallHeight });
    this.frontZ = layout.frontZ;
    this.backZ = layout.backZ;
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
      minZ: this.backZ, maxZ: this.frontZ,
    });
    // Volumes sólidos na altura do corpo. Travessas e painéis elevados são decorativos.
    this.collisionObstacles = [];
    this.refreshArchitectureColliders();
    // Limite lógico da frente aberta, sem adicionar parede visível.
    this.collisionObstacles.push({ id: 'front-boundary', position: { x: 0, z: this.frontZ + 0.1 },
      width: this.dimensions.width + 0.4, depth: 0.2 });
    this.kitchen = new Kitchen({ sideExpansion: this.sideExpansion });
    this.scene.add(this.kitchen.group);
    this.collisionObstacles.push(...this.kitchen.colliders);
    // Enquadramento da arquitetura e dos equipamentos, sem a posição das luzes.
    this.bounds = new Box3().setFromObject(this.architecture);
    this.bounds.union(new Box3().setFromObject(this.kitchen.group));
    this.exterior = new ExteriorDecoration(layout);
    this.scene.add(this.exterior.group);
    this.createLighting();
    this.player = new Player({ id: 'player', chef: true, position: this.kitchen.spawnPosition });
    this.players = [this.player];
    if (gameMode === 'coop') this.players.push(new Player({ id: 'p2', character: 'daniel', chef: true, position: this.kitchen.spawnPosition.clone().setZ(5.7) }));
    for (const player of this.players) this.scene.add(player.group);
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

  refreshArchitectureColliders(collisionSystem = null) {
    this.architecture.updateMatrixWorld(true);
    for (const object of this.architecture.children) {
      if (!/^(back-wall(?:-extension-.*)?|left-wall|right-low-wall|.*-skirting|back-post-.*|left-post-.*|right-wall-cap)$/.test(object.name)) continue;
      const box = new Box3().setFromObject(object);
      const values = { top: box.max.y, bounds: { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z } };
      let collider = this.collisionObstacles.find(candidate => candidate.id === object.name);
      if (collider) Object.assign(collider, values);
      else { collider = { id: object.name, ...values }; this.collisionObstacles.push(collider); }
      collisionSystem?.registerObstacle(collider);
    }
  }

  createFloor() {
    const { depth } = this.dimensions;
    const baseWidth = this.baseWidth, extra = this.sideExpansion;
    this.horizontalModules('floor-foundation', [baseWidth + .5, .36, depth + .5], [0, -.25, 2], this.materials.foundation);
    // Juntas de 0,018 unidade e emendas alternadas, sem texturas externas.
    for (let row = 0; row < depth; row++) {
      let start = -baseWidth / 2;
      let index = 0;
      while (start < baseWidth / 2) {
        const length = Math.min(index === 0 && row % 2 ? 1.5 : 3, baseWidth / 2 - start);
        this.box(`floor-plank-${row}-${index}`, [length - 0.018, 0.08, 0.982],
          [start + length / 2, -0.04, this.backZ + row + 0.5],
          this.materials.planks[(row * 3 + index) % this.materials.planks.length], false);
        start += length;
        index++;
      }
      for (const side of [-1, 1]) {
        let filled = 0, segment = 0;
        while (filled < extra - 1e-8) {
          const length = Math.min(3, extra - filled);
          this.box(`floor-extension-${side}-${row}-${segment}`, [length - .018, .08, .982],
            [side * (baseWidth / 2 + filled + length / 2), -.04, this.backZ + row + .5],
            this.materials.planks[(row + segment) % this.materials.planks.length], false);
          filled += length; segment++;
        }
      }
    }
    this.horizontalModules('front-floor-edge', [baseWidth + .5, .13, .12], [0, -.03, this.frontZ + .15], this.materials.trim, false);
  }

  horizontalModules(name, size, position, material, castShadow = true) {
    this.box(name, size, position, material, castShadow);
    if (this.sideExpansion <= 0) return;
    for (const side of [-1, 1]) {
      this.box(`${name}-extension-${side}`, [this.sideExpansion, size[1], size[2]],
        [position[0] + side * (size[0] / 2 + this.sideExpansion / 2), position[1], position[2]], material, castShadow);
    }
  }

  createWalls() {
    const { plaster, wood, trim, paper, sage } = this.materials;
    const height = this.dimensions.wallHeight;
    const extra = this.sideExpansion;
    this.horizontalModules('back-wall', [this.baseWidth + .4, height, .22], [0, height / 2, -7.11], plaster);
    this.box('left-wall', [0.22, height, 18.2], [-9.11 - extra, height / 2, 2], plaster);
    // Parede próxima rebaixada para manter os corredores visíveis.
    this.box('right-low-wall', [0.22, 0.65, 18.2], [9.11 + extra, 0.325, 2], plaster);

    this.horizontalModules('back-skirting', [this.baseWidth + .4, .24, .12], [0, .12, -6.94], wood);
    this.box('left-skirting', [0.12, 0.24, 18], [-8.94 - extra, 0.12, 2], wood);
    this.box('right-skirting', [0.12, 0.18, 18], [8.94 + extra, 0.09, 2], wood);
    this.horizontalModules('back-beam', [this.baseWidth + .6, .22, .36], [0, height, -7.1], wood);
    this.box('left-beam', [0.36, 0.22, 18.3], [-9.1 - extra, height, 2], wood);
    this.box('right-wall-cap', [0.34, 0.1, 18.3], [9.11 + extra, 0.68, 2], trim);

    for (const x of [-9, -4.5, 0, 4.5, 9]) {
      this.box(`back-post-${x}`, [0.18, height, 0.28], [x, height / 2, -7], wood);
    }
    if (extra > 0) for (const side of [-1, 1]) {
      this.box(`back-post-extension-${side}`, [.18, height, .28], [side * this.dimensions.width / 2, height / 2, -7], wood);
      const center = side * (this.baseWidth / 2 + extra / 2), panelWidth = extra * .7;
      this.box(`shoji-extension-paper-${side}`, [panelWidth, 1.65, .06], [center, 2.24, -6.95], paper, false);
      for (const offset of [-panelWidth / 2, 0, panelWidth / 2]) {
        this.box(`shoji-extension-upright-${side}-${offset}`, [.055, 1.72, .08], [center + offset, 2.24, -6.89], trim, false);
      }
      for (const y of [1.4, 1.96, 2.52, 3.08]) {
        this.box(`shoji-extension-rail-${side}-${y}`, [panelWidth + .05, .055, .08], [center, y, -6.89], trim, false);
      }
    }
    for (const z of [-2.4, 2.3, 7, 11]) {
      this.box(`left-post-${z}`, [0.28, height, 0.18], [-9 - extra, height / 2, z], wood);
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
      this.box(`left-inset-${z}`, [0.04, 1.15, 3.7], [-8.97 - extra, 2.15, z], sage, false);
      for (const y of [1.55, 2.75]) {
        this.box(`left-inset-rail-${z}-${y}`, [0.09, 0.065, 3.8], [-8.92 - extra, y, z], trim, false);
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
    this.exterior.update(deltaTime);
    this.player.update(deltaTime, direction, dashPressed);
  }

  dispose() {
    // Player possui e libera seus próprios recursos antes da limpeza da arquitetura.
    this.players?.forEach(player => player.dispose());
    const geometries = new Set();
    const materials = new Set();
    this.scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
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

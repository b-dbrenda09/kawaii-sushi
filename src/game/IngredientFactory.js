import { Box3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Ingredient, INGREDIENT_TYPES } from './Ingredient.js';

export class IngredientFactory {
  constructor() {
    this.instances = new Set();
    this.sequence = 0;
    this.disposed = false;
    this.boxes = new Map();
    this.sphere = new SphereGeometry(1, 16, 10);
    this.cylinder = new CylinderGeometry(1, 1, 1, 16);
    this.materials = Object.fromEntries(Object.entries({
      salmon: '#eca49a', cream: '#fff2db', rice: '#fffaf0', bowl: '#c4dfe5',
      cucumber: '#699763', skin: '#4c784d', nori: '#3e5746', noriDetail: '#536e50',
      cookedRice: '#fffdf5', burntRice: '#645149', burntGrain: '#3d3430',
      cucumberCenter: '#dce5b1',
    }).map(([id, color]) => [id, new MeshStandardMaterial({ color, roughness: 0.8 })]));
  }

  mesh(parent, name, geometry, material, position, scale = [1, 1, 1]) {
    const mesh = new Mesh(geometry, this.materials[material]);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(parent, name, size, position, material, radius = 0.025) {
    radius = Math.min(radius, Math.min(...size) / 3);
    const key = `${size.join(',')}:${radius}`;
    if (!this.boxes.has(key)) this.boxes.set(key, new RoundedBoxGeometry(...size, 2, radius));
    return this.mesh(parent, name, this.boxes.get(key), material, position);
  }

  oval(parent, name, scale, position, material) {
    return this.mesh(parent, name, this.sphere, material, position, scale);
  }

  buildModel(type, state) {
    const model = new Group();
    if (type === 'salmon' && state === 'salmon_cut') {
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * 0.12;
        this.box(model, `salmon-slice-${i}`, [0.095, 0.14, 0.34], [x, 0.07, 0], 'salmon', 0.025);
        this.box(model, `salmon-slice-stripe-${i}`, [0.012, 0.005, 0.29], [x, 0.142, 0], 'cream');
      }
    } else if (type === 'salmon') {
      this.box(model, 'raw-salmon-fillet', [0.76, 0.2, 0.42], [0, 0.1, 0], 'salmon', 0.06);
      for (let i = 0; i < 5; i++) {
        const stripe = this.box(model, 'salmon-fat-stripe', [0.022, 0.01, 0.35], [-0.27 + i * 0.135, 0.204, 0], 'cream');
        stripe.rotation.y = 0.22;
      }
    } else if (type === 'rice' && state !== 'rice_raw') {
      this.mesh(model, 'cooked-rice-container', this.cylinder, 'bowl', [0, 0.085, 0], [0.27, 0.17, 0.27]);
      this.mesh(model, 'cooked-rice-container-rim', this.cylinder, 'cream', [0, 0.18, 0], [0.28, 0.03, 0.28]);
      const burnt = state === 'rice_burnt';
      this.oval(model, burnt ? 'burnt-rice-mound' : 'cooked-rice-mound', [0.24, 0.115, 0.24],
        [0, 0.2, 0], burnt ? 'burntRice' : 'cookedRice');
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        this.oval(model, 'soft-rice-grain', [0.045, 0.025, 0.055],
          [Math.cos(angle) * 0.13, 0.29, Math.sin(angle) * 0.13], burnt ? 'burntGrain' : 'cookedRice');
      }
    } else if (type === 'rice') {
      this.mesh(model, 'raw-rice-container', this.cylinder, 'bowl', [0, 0.085, 0], [0.27, 0.17, 0.27]);
      this.mesh(model, 'raw-rice-container-rim', this.cylinder, 'cream', [0, 0.18, 0], [0.28, 0.03, 0.28]);
      this.oval(model, 'raw-rice-bed', [0.235, 0.025, 0.235], [0, 0.19, 0], 'rice');
      // Grãos longos e separados, sem a cúpula de arroz cozido.
      for (let row = -2; row <= 2; row++) {
        for (let col = -2; col <= 2; col++) {
          if (row * row + col * col > 5) continue;
          const grain = this.oval(model, 'raw-rice-grain', [0.017, 0.014, 0.045],
            [col * 0.08, 0.22, row * 0.075], 'rice');
          grain.rotation.y = (row + col) * 0.37;
        }
      }
    } else if (type === 'cucumber' && state === 'cucumber_cut') {
      for (let i = 0; i < 6; i++) {
        const x = (i % 3 - 1) * 0.23;
        const z = (Math.floor(i / 3) - 0.5) * 0.23;
        this.mesh(model, `cucumber-slice-${i}`, this.cylinder, 'skin', [x, 0.03, z], [0.105, 0.06, 0.105]);
        this.mesh(model, `cucumber-slice-center-${i}`, this.cylinder, 'cucumberCenter', [x, 0.063, z], [0.082, 0.008, 0.082]);
        for (let seed = 0; seed < 3; seed++) {
          const angle = seed * Math.PI * 2 / 3;
          this.oval(model, 'cucumber-seed', [0.012, 0.003, 0.024], [x + Math.cos(angle) * 0.038, 0.07, z + Math.sin(angle) * 0.038], 'cream');
        }
      }
    } else if (type === 'cucumber') {
      this.oval(model, 'whole-cucumber', [0.4, 0.09, 0.09], [0, 0.09, 0], 'cucumber');
      for (const side of [-1, 1]) this.oval(model, 'cucumber-end', [0.025, 0.035, 0.035], [side * 0.395, 0.09, 0], 'skin');
      for (let i = 0; i < 7; i++) this.oval(model, 'cucumber-mark', [0.025, 0.008, 0.012],
        [-0.27 + i * 0.09, 0.18, i % 2 ? -0.025 : 0.025], 'skin');
    } else if (type === 'nori') {
      this.box(model, 'nori-sheet', [0.72, 0.025, 0.48], [0, 0.0125, 0], 'nori', 0.005);
      for (const x of [-0.24, -0.08, 0.08, 0.24]) this.box(model, 'nori-texture', [0.008, 0.003, 0.4], [x, 0.027, 0], 'noriDetail');
      for (const z of [-0.14, 0, 0.14]) this.box(model, 'nori-cross-texture', [0.64, 0.003, 0.008], [0, 0.028, z], 'noriDetail');
    }
    return model;
  }

  create(type, state = INGREDIENT_TYPES[type]?.initialState) {
    if (this.disposed) throw new Error('Fábrica de ingredientes encerrada.');
    const definition = INGREDIENT_TYPES[type];
    const states = { salmon: ['salmon_raw', 'salmon_cut'], cucumber: ['cucumber_whole', 'cucumber_cut'],
      rice: ['rice_raw', 'rice_cooked', 'rice_burnt'], nori: ['nori_sheet'] };
    if (!definition || !states[type]?.includes(state)) {
      throw new Error(`Ingrediente ou estado desconhecido: ${type}/${state}`);
    }
    const model = this.buildModel(type, state);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    const ingredient = new Ingredient(definition, `ingredient-${++this.sequence}`, model,
      Object.freeze({ width: size.x, height: size.y, depth: size.z }), (item) => this.instances.delete(item));
    this.instances.add(ingredient);
    ingredient.state = state;
    if (type === 'rice') ingredient.name = this.riceName(state);
    if (state === 'salmon_cut') ingredient.name = 'Salmão cortado';
    if (state === 'cucumber_cut') ingredient.name = 'Pepino cortado';
    model.userData.ingredientState = state;
    return ingredient;
  }

  riceName(state) {
    return { rice_raw: 'Arroz cru', rice_cooked: 'Arroz cozido', rice_burnt: 'Arroz queimado' }[state];
  }

  setRiceState(ingredient, state) {
    const allowed = { rice_raw: 'rice_cooked', rice_cooked: 'rice_burnt' };
    if (this.disposed || !this.instances.has(ingredient) || ingredient.disposed || ingredient.type !== 'rice'
      || allowed[ingredient.state] !== state) throw new Error('Transição inválida de estado do arroz.');
    this.applyState(ingredient, state, this.riceName(state));
  }

  setCutState(ingredient, state) {
    const allowed = { salmon: ['salmon_raw', 'salmon_cut'], cucumber: ['cucumber_whole', 'cucumber_cut'] }[ingredient?.type];
    if (this.disposed || !this.instances.has(ingredient) || ingredient.disposed || !allowed
      || ingredient.state !== allowed[0] || state !== allowed[1]) throw new Error('Transição inválida de corte.');
    this.applyState(ingredient, state, ingredient.type === 'salmon' ? 'Salmão cortado' : 'Pepino cortado');
  }

  // Rebuild only after a completed valid stroke; logical state remains raw until the last cut.
  setCutProgress(ingredient, cuts, requiredCuts) {
    if (!this.instances.has(ingredient) || ingredient.disposed || !Number.isInteger(cuts)
      || cuts <= 0 || cuts >= requiredCuts || !['salmon_raw', 'cucumber_whole'].includes(ingredient.state)) return;
    const root = new Group(), count = requiredCuts + 1, width = .76 / count;
    for (let i = 0; i <= cuts; i++) {
      const remaining = i === cuts ? count - cuts : 1;
      const length = width * remaining - .012;
      const x = -.38 + width * (i + remaining / 2);
      if (ingredient.type === 'salmon') {
        this.box(root, `partial-salmon-${i}`, [length, .2, .42], [x, .1, 0], 'salmon');
        this.box(root, `partial-salmon-stripe-${i}`, [.012, .006, .34], [x, .203, 0], 'cream');
      } else {
        const piece = this.mesh(root, `partial-cucumber-${i}`, this.cylinder, 'skin', [x, .09, 0], [.09, length, .09]);
        piece.rotation.z = Math.PI / 2;
        for (const side of [-1, 1]) {
          const face = this.mesh(root, `partial-cucumber-center-${i}`, this.cylinder, 'cucumberCenter',
            [x + side * length / 2, .09, 0], [.07, .003, .07]);
          face.rotation.z = Math.PI / 2;
        }
      }
    }
    ingredient.model.clear();
    ingredient.model.add(...root.children);
    ingredient.model.userData.completedCuts = cuts;
  }

  applyState(ingredient, state, name) {
    const nextModel = this.buildModel(ingredient.type, state);
    const size = new Box3().setFromObject(nextModel).getSize(new Vector3());
    ingredient.model.clear();
    ingredient.model.add(...nextModel.children);
    ingredient.state = state;
    ingredient.name = name;
    ingredient.model.userData.ingredientState = state;
    delete ingredient.model.userData.completedCuts;
    ingredient.dimensions = Object.freeze({ width: size.x, height: size.y, depth: size.z });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const ingredient of this.instances) ingredient.dispose();
    this.sphere.dispose();
    this.cylinder.dispose();
    this.boxes.forEach((geometry) => geometry.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
    this.boxes.clear();
  }
}

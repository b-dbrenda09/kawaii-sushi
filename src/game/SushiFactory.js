import { Box3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Geometrias e materiais pertencem à fábrica; pratos individuais só removem seus grupos.
export class SushiFactory {
  constructor() {
    this.geometries = new Map();
    this.materials = Object.fromEntries(Object.entries({ plate: '#fff0dd', rim: '#edb3c0', rice: '#fffdf0',
      salmon: '#f49b83', stripe: '#ffdac4', nori: '#294d3b', cucumber: '#82bd62', bamboo: '#dfbc83', blade: '#dbe5e9' })
      .map(([name, color]) => [name, new MeshStandardMaterial({ color, roughness: 0.8 })]));
    this.sphere = new SphereGeometry(1, 12, 8);
    this.cylinder = new CylinderGeometry(1, 1, 1, 16);
    this.instances = new Set();
    this.nextId = 1;
    this.disposed = false;
  }

  mesh(parent, geometry, material, position, scale) {
    const mesh = new Mesh(geometry, this.materials[material]);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(parent, material, size, position) {
    const key = size.join(',');
    if (!this.geometries.has(key)) this.geometries.set(key, new RoundedBoxGeometry(...size, 2, Math.min(...size) * 0.2));
    return this.mesh(parent, this.geometries.get(key), material, position, [1, 1, 1]);
  }

  plate() {
    const root = new Group();
    root.name = 'sushi-plate';
    this.box(root, 'rim', [0.84, 0.055, 0.56], [0, 0.0275, 0]);
    this.box(root, 'plate', [0.77, 0.025, 0.49], [0, 0.058, 0]);
    return root;
  }

  preview(sequence) {
    const root = this.plate();
    root.userData.sequence = [...sequence];
    if (!sequence.length) return root;
    const noriFirst = sequence[0] === 'nori_sheet';
    if (noriFirst) this.box(root, 'nori', [0.61, 0.018, 0.35], [0, 0.084, 0]);
    if (sequence.includes('rice_cooked')) {
      this.box(root, 'rice', [0.55, 0.08, 0.3], [0, noriFirst ? 0.127 : 0.11, 0]);
      for (let i = 0; i < 12; i++) this.mesh(root, this.sphere, 'rice',
        [-0.225 + (i % 6) * 0.09, noriFirst ? 0.169 : 0.152, -0.102 + Math.floor(i / 6) * 0.204], [0.034, 0.015, 0.025]);
    }
    if (!noriFirst && sequence.includes('nori_sheet')) this.box(root, 'nori', [0.49, 0.016, 0.25], [0, 0.169, 0]);
    // Ingredientes adicionados antes da base continuam visíveis na prévia.
    const salmon = sequence.includes('salmon_cut');
    if (sequence.includes('cucumber_cut')) for (const z of [-.115, .115]) {
      this.box(root, 'cucumber', [.44, .04, .05], [0, .206, z]);
    }
    if (salmon) {
      this.box(root, 'salmon', [.45, .044, .155], [0, .206, 0]);
      for (const x of [-.13, 0, .13]) this.box(root, 'stripe', [.024, .008, .135], [x, .23, 0]);
    }
    return root;
  }

  finalModel(recipe) {
    const root = this.plate();
    if (recipe.model === 'nigiri') {
      for (const x of [-0.19, 0.19]) {
        this.mesh(root, this.sphere, 'rice', [x, 0.135, 0], [0.145, 0.075, 0.16]);
        for (const side of [-1, 1]) for (const z of [-.09, 0, .09]) {
          this.mesh(root, this.sphere, 'rice', [x + side * .13, .15, z], [.02, .014, .027]);
        }
        this.box(root, 'salmon', [0.27, 0.045, 0.32], [x, 0.205, 0]);
        for (const z of [-0.09, 0.02, 0.12]) this.box(root, 'stripe', [0.24, 0.004, 0.012], [x, 0.23, z]);
      }
    } else if (recipe.model === 'maki' || recipe.model === 'uramaki') {
      const outsideRice = recipe.model === 'uramaki';
      for (const x of [-0.15, 0.15]) for (const z of [-0.125, 0.125]) {
        this.mesh(root, this.cylinder, outsideRice ? 'rice' : 'nori', [x, 0.16, z], [0.105, 0.18, 0.105]);
        this.mesh(root, this.cylinder, outsideRice ? 'nori' : 'rice', [x, 0.252, z], [0.081, 0.008, 0.081]);
        this.mesh(root, this.cylinder, outsideRice ? 'cucumber' : 'salmon', [x, 0.258, z], [0.04, 0.008, 0.04]);
        if (outsideRice) for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          this.mesh(root, this.sphere, 'rice', [x + Math.cos(angle) * 0.09, 0.24, z + Math.sin(angle) * 0.09], [0.02, 0.015, 0.02]);
        }
      }
    } else throw new Error(`Modelo de sushi desconhecido: ${recipe.model}`);
    root.userData.recipeId = recipe.id;
    return root;
  }

  create(recipe) {
    if (this.disposed) throw new Error('Fábrica de sushi removida.');
    const model = this.finalModel(recipe);
    const bounds = new Box3().setFromObject(model);
    const dish = { kind: 'sushi', type: 'sushi', instanceId: `sushi-${this.nextId++}`, recipeId: recipe.id,
      recipeName: recipe.name, name: recipe.name, state: 'sushi_ready', completionState: 'READY', model,
      dimensions: { width: bounds.max.x - bounds.min.x, depth: bounds.max.z - bounds.min.z },
      location: 'unassigned', ownerId: null, disposed: false,
      dispose: () => {
        if (dish.disposed) return;
        model.removeFromParent();
        model.clear();
        dish.disposed = true;
        dish.location = 'removed';
        dish.ownerId = null;
        this.instances.delete(dish);
      } };
    model.name = dish.instanceId;
    Object.assign(model.userData, { instanceId: dish.instanceId, recipeId: recipe.id });
    this.instances.add(dish);
    return dish;
  }

  dispose() {
    if (this.disposed) return;
    for (const dish of this.instances) dish.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.sphere.dispose();
    this.cylinder.dispose();
    Object.values(this.materials).forEach((material) => material.dispose());
    this.disposed = true;
  }
}

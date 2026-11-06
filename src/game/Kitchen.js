import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Station } from './Station.js';

export class Kitchen {
  constructor() {
    this.group = new Group();
    this.group.name = 'kitchen-equipment';
    this.stations = new Map();
    this.geometries = new Map();
    this.materials = Object.fromEntries(Object.entries({
      wood: '#d6ab7f', lightWood: '#ebcba3', grain: '#bc9068', cream: '#fff4de',
      blue: '#bcdce6', pink: '#edc4cb', red: '#d78382', metal: '#d8dedb',
      dark: '#596663', nori: '#465e4d', rice: '#fffaf0', salmon: '#eca49a', green: '#a8bea0',
      cucumber: '#699763', cucumberSkin: '#4c784d', cucumberCenter: '#d5dfa0',
    }).map(([name, color]) => [name, new MeshStandardMaterial({ color, roughness: 0.78, metalness: name === 'metal' ? 0.18 : 0 })]));
    this.cylinderGeometry = new CylinderGeometry(1, 1, 1, 16);
    this.sphereGeometry = new SphereGeometry(1, 16, 10);
    this.clientArea = Object.freeze({ position: new Vector3(0, 0, -6.05), width: 6, depth: 1.2 });
    this.spawnPosition = new Vector3(0, 0, 4.2);

    this.createIngredientBoxes();
    this.createCutting();
    this.createCutting('cutting2', [7.25, 0]);
    this.createCutting('cutting3', [7.25, 3.1]);
    this.createRiceCooker();
    this.createRiceCooker('riceCooker2', [-3.15, 8.7], 'riceBench1');
    this.createRiceCooker('riceCooker3', [3.15, 8.7], 'riceBench2');
    this.createRiceCooker('riceCooker4', [5.65, 8.7], 'riceBench2');
    this.createAssembly();
    this.createAssembly('assembly2', [-3, 4.5]);
    this.createAssembly('assembly3', [3, 4.5]);
    for (const x of [-4.4, 4.4]) this.box(this.group, 'rice-bench-continuous-trim', [5, 0.08, 0.08], [x, 1.03, 7.94], 'pink');
    this.createDelivery();
    this.createTrash();
    this.createDecorations();
    this.colliders = [...this.stations.values()].map((station) => station.collider);
  }

  station(options) {
    const station = new Station(options);
    this.stations.set(station.id, station);
    this.group.add(station.model);
    return station;
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

  box(parent, name, size, position, material = 'wood', radius = 0.045) {
    const bevel = Math.min(radius, Math.min(...size) / 3);
    const key = `${size.join(',')}:${bevel}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new RoundedBoxGeometry(...size, 2, bevel));
    return this.mesh(parent, name, this.geometries.get(key), material, position);
  }

  cylinder(parent, name, radius, height, position, material = 'cream') {
    return this.mesh(parent, name, this.cylinderGeometry, material, position, [radius, height, radius]);
  }

  oval(parent, name, scale, position, material = 'cream') {
    return this.mesh(parent, name, this.sphereGeometry, material, position, scale);
  }

  counter(station, accent = 'cream') {
    const { width: w, depth: d, height: h } = station.localDimensions;
    const model = station.model;
    this.box(model, 'recessed-plinth', [w - 0.22, 0.12, d - 0.22], [0, 0.06, 0], 'grain');
    this.box(model, 'wood-cabinet', [w - 0.1, h - 0.24, d - 0.1], [0, h / 2 - 0.01, 0]);
    this.box(model, 'work-surface', [w, 0.16, d], [0, h - 0.08, 0], accent, 0.07);
    for (const side of [-1, 1]) {
      this.box(model, `cabinet-door-${side}`, [w / 2 - 0.11, h - 0.37, 0.055],
        [side * w / 4, h / 2, d / 2 - 0.035], 'lightWood');
      this.box(model, `cabinet-handle-${side}`, [0.3, 0.045, 0.055],
        [side * w / 4, h - 0.34, d / 2 + 0.015], 'grain');
    }
  }

  createIngredientBoxes() {
    const ingredients = [
      { id: 'salmonBox', ingredient: 'salmon', label: 'Salmão', z: -4.4, accent: 'pink' },
      { id: 'riceBox', ingredient: 'rice', label: 'Arroz', z: -2.3, accent: 'blue' },
      { id: 'cucumberBox', ingredient: 'cucumber', label: 'Pepino', z: -0.2, accent: 'green' },
      { id: 'noriBox', ingredient: 'nori', label: 'Alga nori', z: 1.9, accent: 'cream' },
    ];
    for (const { id, ingredient, label, z, accent } of ingredients) {
      const station = this.station({ id, position: [-7.35, z], width: 1.55, depth: 1.5, height: 1.2, rotation: Math.PI / 2 });
      // Fontes ilimitadas; os ingredientes decorativos nunca saem das caixas.
      station.ingredientSource = Object.freeze({ ingredient, label, unlimited: true });
      station.interactionArea = Object.freeze({ position: station.getApproachPosition(), radius: 0.55 });
      const model = station.model;
      this.box(model, 'ingredient-box-plinth', [1.35, 0.12, 1.3], [0, 0.06, 0], 'grain');
      this.box(model, 'ingredient-box-stand', [1.45, 0.5, 1.4], [0, 0.37, 0], 'lightWood');
      this.box(model, 'ingredient-box-stand-trim', [1.5, 0.07, 1.45], [0, 0.655, 0], 'wood');
      this.box(model, 'ingredient-box-bottom', [1.55, 0.09, 1.5], [0, 0.73, 0], 'lightWood');
      for (const side of [-1, 1]) {
        this.box(model, `ingredient-box-side-${side}`, [0.11, 0.31, 1.5], [side * 0.72, 0.895, 0], 'lightWood');
        this.box(model, `ingredient-box-end-${side}`, [1.33, 0.31, 0.11], [0, 0.895, side * 0.695], 'lightWood');
        this.box(model, `ingredient-box-seam-${side}`, [0.012, 0.015, 1.42], [side * 0.778, 0.88, 0], 'wood');
      }
      this.box(model, 'ingredient-box-label', [0.88, 0.25, 0.035], [0, 0.91, 0.765], accent);
      const contents = new Group();
      contents.name = `${ingredient}-contents`;
      model.add(contents);
      this.createIngredientContents(contents, ingredient);
      this.createIngredientIcon(model, ingredient);
    }
  }

  createIngredientContents(parent, ingredient) {
    if (ingredient === 'salmon') {
      for (let i = 0; i < 3; i++) {
        const piece = new Group();
        piece.name = `salmon-fillet-${i}`;
        piece.position.set((i - 1) * 0.36, 0.91 + (i % 2) * 0.06, 0);
        piece.rotation.y = (i - 1) * 0.13;
        parent.add(piece);
        this.box(piece, 'salmon-fillet', [0.29, 0.25, 0.91], [0, 0, 0], 'salmon', 0.07);
        for (let stripe = 0; stripe < 4; stripe++) {
          const line = this.box(piece, 'salmon-fillet-stripe', [0.25, 0.012, 0.022], [0, 0.13, -0.3 + stripe * 0.2], 'cream');
          line.rotation.y = 0.2;
        }
      }
    } else if (ingredient === 'rice') {
      this.cylinder(parent, 'rice-container', 0.56, 0.16, [0, 0.86, 0], 'cream');
      this.oval(parent, 'rice-mound', [0.5, 0.2, 0.5], [0, 0.99, 0], 'rice');
      for (let ring = 0; ring < 2; ring++) {
        for (let i = 0; i < 9; i++) {
          const angle = i * Math.PI * 2 / 9 + ring * 0.2;
          const distance = ring ? 0.34 : 0.17;
          const grain = this.oval(parent, `rice-grain-${ring}-${i}`, [0.035, 0.025, 0.065],
            [Math.cos(angle) * distance, ring ? 1.14 : 1.185, Math.sin(angle) * distance], 'rice');
          grain.rotation.y = angle;
        }
      }
    } else if (ingredient === 'cucumber') {
      for (let i = 0; i < 3; i++) {
        const cucumber = new Group();
        cucumber.name = `cucumber-${i}`;
        cucumber.position.set((i - 1) * 0.35, 0.96, 0);
        cucumber.rotation.y = (i - 1) * 0.15;
        parent.add(cucumber);
        this.oval(cucumber, 'whole-cucumber', [0.135, 0.135, 0.54], [0, 0, 0], 'cucumber');
        for (const side of [-1, 1]) this.oval(cucumber, 'cucumber-tip', [0.06, 0.06, 0.045], [0, 0, side * 0.51], 'cucumberSkin');
        for (let j = 0; j < 5; j++) this.oval(cucumber, 'cucumber-speckle', [0.018, 0.012, 0.026],
          [j % 2 ? -0.04 : 0.04, 0.132, -0.32 + j * 0.16], 'cucumberSkin');
      }
      const slice = this.cylinder(parent, 'cucumber-slice', 0.16, 0.06, [0.33, 1.11, 0.37], 'cucumberSkin');
      this.cylinder(slice, 'cucumber-slice-center', 0.79, 1.03, [0, 0.02, 0], 'cucumberCenter');
    } else if (ingredient === 'nori') {
      for (let i = 0; i < 4; i++) {
        const sheet = new Group();
        sheet.name = `nori-sheet-${i}`;
        sheet.position.set((i - 1.5) * 0.055, 0.81 + i * 0.065, (i - 1.5) * 0.07);
        sheet.rotation.y = (i - 1.5) * 0.09;
        parent.add(sheet);
        this.box(sheet, 'nori-leaf', [0.89, 0.035, 0.86], [0, 0, 0], 'nori');
        for (const x of [-0.26, 0, 0.26]) this.box(sheet, 'nori-leaf-texture', [0.012, 0.008, 0.73], [x, 0.021, 0], 'cucumberSkin');
      }
    }
  }

  createIngredientIcon(parent, ingredient) {
    // Pictogramas em relevo reforçam a identificação sem depender apenas da cor.
    if (ingredient === 'salmon') {
      this.box(parent, 'salmon-icon', [0.43, 0.14, 0.022], [0, 0.91, 0.795], 'salmon');
      for (const x of [-0.12, 0, 0.12]) this.box(parent, 'salmon-icon-stripe', [0.02, 0.12, 0.012], [x, 0.91, 0.812], 'cream');
    } else if (ingredient === 'rice') {
      this.oval(parent, 'rice-icon-bowl', [0.23, 0.07, 0.018], [0, 0.88, 0.797], 'cream');
      this.oval(parent, 'rice-icon-mound', [0.19, 0.06, 0.018], [0, 0.95, 0.797], 'rice');
    } else if (ingredient === 'cucumber') {
      const icon = this.oval(parent, 'cucumber-icon', [0.22, 0.06, 0.02], [0, 0.91, 0.797], 'cucumberSkin');
      icon.rotation.z = 0.2;
    } else {
      for (let i = 0; i < 2; i++) this.box(parent, 'nori-icon', [0.25, 0.14, 0.015], [i * 0.1 - 0.05, 0.93 - i * 0.035, 0.797 + i * 0.012], 'nori');
    }
  }

  createCutting(id = 'cutting', position = [7.25, -3.1]) {
    const station = this.station({ id, type: 'cutting', position, width: 2.8, depth: 1.55, height: 1.12, rotation: -Math.PI / 2 });
    station.configureStorage({ position: [0.96, 1.12, 0.27], width: 0.86, depth: 0.65 });
    this.counter(station);
    const model = station.model;
    this.box(model, 'cutting-board', [1.45, 0.075, 0.87], [-0.2, 1.16, 0.03], 'lightWood');
    for (const x of [-0.71, 0.31]) this.box(model, 'cutting-board-grain', [0.018, 0.005, 0.73], [x, 1.2, 0.03], 'wood');
    this.box(model, 'decorative-knife-blade', [0.4, 0.035, 0.11], [0.05, 1.22, 0.27], 'metal');
    this.box(model, 'decorative-knife-handle', [0.24, 0.065, 0.1], [0.37, 1.23, 0.27], 'grain');
    this.box(model, 'salmon-piece', [0.49, 0.12, 0.26], [-0.48, 1.255, -0.05], 'salmon');
    for (let i = 0; i < 3; i++) this.box(model, 'salmon-stripe', [0.025, 0.007, 0.25], [-0.62 + i * 0.13, 1.318, -0.05], 'cream');
    this.cylinder(model, 'utensil-cup', 0.15, 0.28, [0.97, 1.26, -0.35], 'pink');
    for (let i = 0; i < 3; i++) this.box(model, `utensil-${i}`, [0.035, 0.43, 0.035], [0.9 + i * 0.065, 1.52, -0.35], 'wood');
  }

  createRiceCooker(id = 'riceCooker', position = [-5.65, 8.7], benchId = 'riceBench1') {
    const station = this.station({ id, type: 'riceCooker', benchId, position, width: 2.5, depth: 1.55, height: 1.92, rotation: Math.PI });
    // Altura do equipamento inclui a panela; a bancada continua na mesma altura das demais.
    const counterStation = { model: station.model, localDimensions: { width: 2.5, depth: 1.55, height: 1.12 } };
    this.counter(counterStation);
    const model = station.model;
    this.oval(model, 'rice-cooker-body', [0.57, 0.35, 0.49], [-0.15, 1.49, 0], 'cream');
    this.cylinder(model, 'rice-cooker-base', 0.44, 0.09, [-0.15, 1.17, 0], 'blue');
    this.oval(model, 'rice-cooker-lid', [0.58, 0.115, 0.5], [-0.15, 1.75, 0], 'pink');
    this.box(model, 'rice-cooker-lid-handle', [0.38, 0.085, 0.14], [-0.15, 1.88, 0], 'cream');
    this.box(model, 'rice-cooker-front-panel', [0.42, 0.2, 0.05], [-0.15, 1.47, 0.46], 'blue');
    this.box(model, 'rice-cooker-display', [0.19, 0.065, 0.02], [-0.21, 1.49, 0.492], 'dark');
    for (const x of [0.0, 0.075]) this.oval(model, 'rice-cooker-button', [0.025, 0.025, 0.012], [x, 1.44, 0.495], 'cream');
    for (const x of [-0.77, 0.47]) this.box(model, 'rice-cooker-side-handle', [0.16, 0.13, 0.28], [x, 1.57, 0], 'blue');
    this.cylinder(model, 'rice-bowl', 0.22, 0.16, [0.86, 1.2, 0.2], 'blue');
    this.oval(model, 'rice-bowl-rice', [0.19, 0.06, 0.19], [0.86, 1.28, 0.2], 'rice');
  }

  createAssembly(id = 'assembly', position = [0, 0]) {
    const station = this.station({ id, type: 'assembly', position, width: 3.8, depth: 2.4, height: 1.12 });
    station.configureStorage({ position: [0, 1.12, 0.88], width: 0.9, depth: 0.6 });
    this.counter(station);
    const model = station.model;
    this.box(model, 'bamboo-mat-base', [1.62, 0.035, 1.1], [-0.52, 1.14, 0], 'lightWood');
    for (let i = 0; i < 13; i++) this.box(model, `bamboo-mat-slat-${i}`, [0.087, 0.025, 1.07], [-1.25 + i * 0.122, 1.17, 0], 'wood');
    for (const z of [-0.36, 0.36]) this.box(model, 'bamboo-mat-binding', [1.56, 0.008, 0.018], [-0.52, 1.187, z], 'cream');
    this.box(model, 'sushi-serving-tray', [0.91, 0.065, 0.8], [1.05, 1.155, 0.04], 'dark');
    for (let i = 0; i < 3; i++) {
      const x = 0.78 + i * 0.27;
      this.cylinder(model, `decorative-maki-nori-${i}`, 0.115, 0.17, [x, 1.27, 0.02], 'nori');
      this.cylinder(model, `decorative-maki-rice-${i}`, 0.09, 0.015, [x, 1.362, 0.02], 'rice');
      this.cylinder(model, `decorative-maki-center-${i}`, 0.035, 0.019, [x, 1.374, 0.02], 'salmon');
    }
    this.cylinder(model, 'small-soy-bowl', 0.16, 0.065, [1.05, 1.22, -0.5], 'pink');
    this.cylinder(model, 'soy-surface', 0.12, 0.01, [1.05, 1.258, -0.5], 'dark');
    // Painel traseiro da ilha também recebe acabamento, pois é acessível dos quatro lados.
    for (const x of [-1.2, 0, 1.2]) this.box(model, 'island-back-panel', [1.1, 0.7, 0.05], [x, 0.59, -1.16], 'lightWood');
  }

  createDelivery() {
    const station = this.station({ id: 'delivery', position: [0, -4.8], width: 6, depth: 1.4, height: 1.16 });
    this.counter(station, 'lightWood');
    const model = station.model;
    this.box(model, 'delivery-front-band', [5.8, 0.15, 0.05], [0, 0.83, 0.7], 'pink');
    for (const x of [-1.65, 0, 1.65]) {
      this.box(model, 'delivery-tray', [1.03, 0.045, 0.75], [x, 1.185, 0.02], 'cream');
      this.box(model, 'delivery-tray-inset', [0.88, 0.012, 0.61], [x, 1.215, 0.02], 'lightWood');
    }
  }

  createTrash() {
    const station = this.station({ id: 'trash', position: [-7.1, 4.7], width: 0.96, depth: 0.96, height: 1.04 });
    const model = station.model;
    this.cylinder(model, 'trash-body', 0.44, 0.84, [0, 0.46, 0], 'blue');
    this.cylinder(model, 'trash-base', 0.42, 0.08, [0, 0.04, 0], 'dark');
    this.cylinder(model, 'trash-lid-rim', 0.48, 0.08, [0, 0.91, 0], 'cream');
    this.oval(model, 'trash-lid', [0.47, 0.095, 0.47], [0, 0.945, 0], 'blue');
    this.box(model, 'trash-pedal', [0.24, 0.055, 0.16], [0, 0.09, 0.39], 'metal');
    this.box(model, 'trash-label', [0.22, 0.16, 0.025], [0, 0.56, 0.44], 'cream');
  }

  createDecorations() {
    const decor = new Group();
    decor.name = 'kitchen-decoration';
    this.group.add(decor);
    for (const x of [-4.9, 4.9]) {
      this.box(decor, 'lantern-bracket', [0.06, 0.08, 0.38], [x, 3.25, -6.7], 'grain');
      this.box(decor, 'lantern-cord', [0.025, 0.24, 0.025], [x, 3.08, -6.55], 'grain');
      this.oval(decor, 'paper-lantern', [0.3, 0.38, 0.3], [x, 2.64, -6.55], 'pink');
      for (const y of [2.32, 2.96]) this.cylinder(decor, 'lantern-cap', 0.18, 0.06, [x, y, -6.55], 'wood');
      for (const y of [2.48, 2.64, 2.8]) this.cylinder(decor, 'lantern-rib', y === 2.64 ? 0.302 : 0.275, 0.016, [x, y, -6.55], 'cream');
    }
    // Faixa de piso sem collider: área reservada, ainda sem clientes ou mecânicas.
    this.box(decor, 'reserved-client-area', [5.8, 0.012, 0.95], [0, 0.006, -6.05], 'lightWood');
  }
}

import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SphereGeometry } from 'three';

export class RiceCookerEffects {
  constructor(station) {
    this.station = station;
    this.disposed = false;
    this.phase = 0;
    this.group = new Group();
    this.group.name = 'rice-cooker-effects';
    station.model.add(this.group);
    this.geometries = new Set();
    this.materials = new Set();
    this.sphere = new SphereGeometry(1, 12, 8);
    this.geometries.add(this.sphere);
    const material = (color, basic = false, extra = {}) => {
      const result = basic ? new MeshBasicMaterial({ color, ...extra }) : new MeshStandardMaterial({ color, roughness: 0.85, ...extra });
      this.materials.add(result);
      return result;
    };
    this.led = this.mesh('cooker-indicator-light', this.sphere, material('#bcdce6', true), [-0.02, 1.51, 0.496], [0.025, 0.025, 0.012]);
    this.mound = this.mesh('cooker-visible-rice', this.sphere, material('#fffaf0'), [-0.15, 1.87, 0], [0.31, 0.025, 0.29]);
    this.grains = [];
    const grainMaterial = material('#fffdf4');
    for (let row = -1; row <= 1; row++) for (let col = -2; col <= 2; col++) {
      this.grains.push(this.mesh('cooker-raw-grain', this.sphere, grainMaterial,
        [-0.15 + col * 0.095, 1.9, row * 0.1], [0.022, 0.014, 0.045]));
    }
    this.particles = Array.from({ length: 5 }, (_, index) => ({ index,
      mesh: this.mesh(`cooker-vapor-${index}`, this.sphere,
        material('#fffdfa', true, { transparent: true, opacity: 0, depthWrite: false }), [-0.15, 2, 0], [0.055, 0.075, 0.055]) }));
    const ring = new RingGeometry(0.36, 0.43, 24);
    this.geometries.add(ring);
    this.glow = this.mesh('cooker-ready-glow', ring,
      material('#bddcb4', true, { transparent: true, opacity: 0, depthWrite: false }), [-0.15, 1.85, 0]);
    this.glow.rotation.x = -Math.PI / 2;
    this.panel = station.model.getObjectByName('rice-cooker-display');
    this.panelOriginal = this.panel.material;
    this.panel.material = this.panelOriginal.clone();
    this.materials.add(this.panel.material);

    this.lidParts = ['rice-cooker-lid', 'rice-cooker-lid-handle'].map((name) => {
      const mesh = station.model.getObjectByName(name);
      return { mesh, position: mesh.position.clone(), quaternion: mesh.quaternion.clone(), scale: mesh.scale.clone() };
    });
    this.lidPivot = new Group();
    this.lidPivot.name = 'rice-cooker-lid-hinge';
    this.lidPivot.position.set(-0.15, 1.75, 0.42);
    station.model.add(this.lidPivot);
    station.model.updateWorldMatrix(true, true);
    this.lidParts.forEach(({ mesh }) => this.lidPivot.attach(mesh));
  }

  mesh(name, geometry, material, position, scale = [1, 1, 1]) {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    this.group.add(mesh);
    return mesh;
  }

  update(deltaTime, cooker) {
    if (this.disposed) return;
    const { state } = cooker;
    const cooking = state === 'COOKING';
    const ready = state === 'READY';
    const burnt = state === 'BURNT';
    const loaded = state === 'LOADED';
    const color = { EMPTY: '#596663', LOADED: '#bcdce6', COOKING: '#efc78f', READY: '#a9cc9f', BURNT: '#cf8d8b' }[state];
    this.led.visible = state !== 'EMPTY';
    this.led.material.color.set(color);
    this.panel.material.color.set(state === 'EMPTY' ? this.panelOriginal.color : color);
    this.panel.material.emissive.set(state === 'EMPTY' ? '#000000' : color);
    this.panel.material.emissiveIntensity = state === 'EMPTY' ? 0 : 0.22;
    this.mound.visible = loaded || ready || burnt;
    this.mound.material.color.set(burnt ? '#645149' : '#fffaf0');
    this.mound.scale.y = loaded ? 0.025 : 0.1;
    this.grains.forEach((grain) => { grain.visible = loaded; });
    const targetLid = loaded || ready || burnt ? 1.05 : 0;
    if (state === 'EMPTY') this.lidPivot.rotation.x = 0;
    else this.lidPivot.rotation.x += (targetLid - this.lidPivot.rotation.x) * (1 - Math.exp(-10 * Math.min(deltaTime, 0.2)));
    this.phase = (this.phase + deltaTime) % 1.4;
    this.lidPivot.rotation.z = cooking ? Math.sin(this.phase / 1.4 * Math.PI * 6) * .006 : 0;
    for (const { mesh, index } of this.particles) {
      mesh.visible = cooking || burnt;
      if (!mesh.visible) { mesh.material.opacity = 0; continue; }
      const age = (this.phase / 1.4 + index / this.particles.length) % 1;
      mesh.position.set(-0.15 + Math.sin(age * 5 + index) * 0.11, 1.98 + age * 0.65, Math.cos(index * 2) * 0.09);
      mesh.scale.set(0.055 + age * 0.06, 0.07 + age * 0.065, 0.055 + age * 0.06);
      mesh.material.color.set(burnt ? '#827674' : '#fffdfa');
      mesh.material.opacity = Math.sin(age * Math.PI) * (burnt ? 0.22 : 0.3);
    }
    this.glow.visible = ready;
    this.glow.material.opacity = ready ? 0.13 + 0.21 * Math.max(0, 1 - cooker.elapsed / 0.9) : 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.panel.material = this.panelOriginal;
    for (const part of this.lidParts) {
      this.station.model.add(part.mesh);
      part.mesh.position.copy(part.position);
      part.mesh.quaternion.copy(part.quaternion);
      part.mesh.scale.copy(part.scale);
    }
    this.lidPivot.removeFromParent();
    this.group.removeFromParent();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}

import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh,
  Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three';

// Visual scenery only: never registered with navigation, collision or camera bounds.
export class ExteriorDecoration {
  constructor(layout) {
    this.group = new Group();
    this.group.name = 'exterior-garden';
    this.time = 0;
    this.batches = new Map();
    this.flowers = [];
    this.animatedBatches = [];
    this.transform = new Object3D();
    this.geometries = {
      box: new BoxGeometry(1, 1, 1),
      round: new SphereGeometry(1, 8, 6),
      rock: new IcosahedronGeometry(1, 0),
      pole: new CylinderGeometry(.8, 1, 1, 8),
    };
    this.materials = Object.fromEntries(Object.entries({
      grass: '#dce8cf', moss: '#c1d7b4', sage: '#aecdb6', pink: '#f3b6cf',
      blush: '#fad2df', lavender: '#d5c7df', wood: '#d4b08a', bark: '#b99580',
      cream: '#fff3dc', stone: '#c5c9bd', pot: '#e6b2a9', leaf: '#9fbd9b',
      rice: '#fffaf0', salmon: '#efaaa4', nori: '#718b79', gold: '#ffe3a3',
    }).map(([key, color]) => [key, new MeshStandardMaterial({ color, roughness: .95 })]));
    this.materials.gold.emissive.set('#ffc87b');
    this.materials.gold.emissiveIntensity = .35;
    const edge = layout.width / 2;
    // Ground sits below the existing foundation; a broad continuous surface avoids hard edges.
    this.part('box', 'grass', [0, -.51, 0], [180, .08, 180]);
    for (const side of [-1, 1]) {
      const x = side * (edge + 2.1);
      for (const z of [-8.4, -2.8, 3]) {
        if (side === 1 && z === -8.4) continue; // Keep the external arrival corridor clear.
        this.tree(x, z, side === 1 ? .78 : .95);
      }
      for (let i = 0; i < 12; i++) {
        const z = -10 + i * 1.85;
        this.part('round', 'stone', [side * (edge + 1.15 + .2 * Math.sin(i)), -.29, z], [.46, .12, .64]);
      }
      for (const z of [-6, 0, 6.2, 9.7]) {
        const clearance = side === 1 && z === -6 ? 1.8 : 0;
        this.bed(side * (edge + 1.8 + clearance), z);
        this.part('round', iColor(z), [side * (edge + 2.3 + clearance), .02, z + .7], [.7, .48, .6]);
      }
    }
    // Customer seating extends 2.7 units behind the original back wall.
    const rear = layout.backZ - 5.2;
    for (let x = -edge - 1; x <= edge + 1; x += 1.3) {
      this.part('pole', 'wood', [x, .05, rear], [.09, 1.1, .09]);
    }
    for (const y of [-.08, .34]) this.part('box', 'wood', [0, y, rear], [layout.width + 2, .1, .09]);
    for (const x of [-edge - 2, 0, edge + 2]) { this.tree(x, rear + 1.9, .65); this.bed(x + 1.8, rear + .5); }
    for (const z of [-5.2, 1.5, 8]) this.lantern(edge + 1.25, z);
    this.sign(edge + 2, 5);
    this.bed(edge + .5, -9.85);
    this.bed(edge + .5, -6.5);
    for (const x of [-8.6, -5.3, 5.3, 8.6]) {
      this.bed(x, layout.frontZ + .55);
      this.part('rock', 'stone', [x + .9, -.23, layout.frontZ + .5], [.35, .22, .28]);
    }
    for (const side of [-1, 1]) {
      const x = side * (edge + .8), z = layout.frontZ - .3;
      this.part('pole', 'pot', [x, -.12, z], [.36, .55, .36]);
      this.flower(x, z, .4, 'pink');
    }
    this.flushBatches();
    this.particles = [];
    for (let i = 0; i < 32; i++) {
      const side = i % 2 ? -1 : 1;
      const mesh = new Mesh(this.geometries.round, this.materials[i < 24 ? 'blush' : 'gold']);
      mesh.scale.setScalar(i < 24 ? .065 : .035);
      this.group.add(mesh);
      this.particles.push({ mesh, x: side * (edge + 1.5 + (i % 3) * .45),
        z: -9 + (i * 2.17 % 19), phase: i * 1.73, sparkle: i >= 24 });
    }
    this.update(0);
  }

  part(shape, color, position, scale, parent = null) {
    const key = `${shape}:${color}`;
    if (!this.batches.has(key)) this.batches.set(key, { shape, color, items: [] });
    this.batches.get(key).items.push({ position, scale, parent });
  }

  flushBatches() {
    const transform = new Object3D();
    for (const { shape, color, items } of this.batches.values()) {
      const mesh = new InstancedMesh(this.geometries[shape], this.materials[color], items.length);
      mesh.name = `garden-${shape}-${color}`;
      items.forEach(({ position, scale, parent }, i) => {
        transform.position.set(...position); transform.scale.set(...scale); transform.updateMatrix();
        if (parent) { parent.updateMatrix(); transform.matrix.premultiply(parent.matrix); }
        mesh.setMatrixAt(i, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      if (items.some(item => item.parent)) this.animatedBatches.push({ mesh, items });
    }
    this.batches.clear();
  }

  tree(x, z, size) {
    this.part('round', 'moss', [x, -.32, z], [1.25 * size, .13, size]);
    this.part('pole', 'bark', [x, .8 * size, z], [.16 * size, 2.4 * size, .16 * size]);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      this.part('round', i % 2 ? 'pink' : 'blush',
        [x + Math.cos(angle) * .55 * size, (2.1 + (i % 2) * .38) * size, z + Math.sin(angle) * .5 * size],
        [.85 * size, .65 * size, .8 * size]);
    }
  }

  flower(x, z, height, color) {
    const stem = new Group();
    stem.position.set(x, -.34, z); this.group.add(stem);
    this.part('pole', 'leaf', [0, height / 2, 0], [.025, height, .025], stem);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      this.part('round', color, [Math.cos(angle) * .09, height, Math.sin(angle) * .09], [.085, .045, .085], stem);
    }
    this.part('round', 'gold', [0, height + .025, 0], [.055, .04, .055], stem);
    this.flowers.push(stem);
  }

  bed(x, z) {
    this.part('round', 'moss', [x, -.36, z], [.78, .12, .53]);
    for (let i = 0; i < 3; i++) this.flower(x + (i - 1) * .33, z + (i % 2) * .2, .28 + i * .06, i % 2 ? 'lavender' : 'pink');
  }

  lantern(x, z) {
    this.part('rock', 'stone', [x, -.22, z], [.4, .2, .4]);
    this.part('pole', 'wood', [x, .2, z], [.09, .8, .09]);
    this.part('box', 'cream', [x, .82, z], [.45, .48, .45]);
    this.part('round', 'gold', [x, .84, z + .235], [.15, .17, .025]);
    this.part('pole', 'wood', [x, 1.15, z], [.42, .18, .42]);
    for (const dx of [-.23, .23]) this.part('box', 'wood', [x + dx, .83, z + .23], [.035, .5, .035]);
  }

  sign(x, z) {
    this.part('pole', 'wood', [x, .15, z], [.08, 1.1, .08]);
    this.part('box', 'wood', [x, .93, z], [1.2, .8, .15]);
    this.part('box', 'cream', [x, .93, z + .09], [1.08, .68, .04]);
    // A little nigiri emblem, built from geometry instead of external textures.
    this.part('round', 'rice', [x, .86, z + .16], [.38, .16, .08]);
    this.part('round', 'salmon', [x, 1.02, z + .18], [.42, .12, .07]);
    this.part('box', 'nori', [x, .96, z + .26], [.1, .28, .025]);
  }

  update(deltaTime) {
    this.time += Number.isFinite(deltaTime) ? Math.max(0, Math.min(deltaTime, .05)) : 0;
    const t = this.time;
    this.flowers.forEach((flower, i) => { flower.rotation.z = Math.sin(t * 1.15 + i * .7) * .065; });
    this.flowers.forEach(flower => flower.updateMatrix());
    for (const { mesh, items } of this.animatedBatches) {
      items.forEach(({ position, scale, parent }, i) => {
        if (!parent) return;
        this.transform.position.set(...position); this.transform.scale.set(...scale); this.transform.updateMatrix();
        this.transform.matrix.premultiply(parent.matrix);
        mesh.setMatrixAt(i, this.transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.materials.gold.emissiveIntensity = .35 + Math.sin(t * 1.3) * .08;
    for (const { mesh, x, z, phase, sparkle } of this.particles) {
      mesh.position.set(x + Math.sin(t * .3 + phase) * .25,
        sparkle ? .3 + .15 * Math.sin(t + phase) : 2.8 - ((t * .23 + phase) % 3.1), z + Math.sin(t * .2 + phase) * .25);
      mesh.rotation.set(t * .4 + phase, phase, t * .25);
      if (sparkle) mesh.scale.setScalar(.035 * Math.max(0, Math.sin(t * .65 + phase)) ** 6);
    }
  }
}

function iColor(z) { return z > 0 ? 'sage' : 'lavender'; }

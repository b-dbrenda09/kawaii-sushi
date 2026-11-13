import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';

import { ConeGeometry } from 'three';
export const CUSTOMER_TYPES = Object.freeze(['rabbit', 'bear', 'panda', 'cat', 'dog']);

// Recursos pertencem à fábrica; remover um cliente não invalida os demais.
export class CustomerFactory {
  constructor() {
    this.geometry = new SphereGeometry(1, 12, 8);
    this.triangle = new ConeGeometry(1, 1, 3);
    this.materials = Object.fromEntries(Object.entries({
      white: '#fff9f3', brown: '#c99e7e', muzzle: '#f2d8ba', black: '#302d39',
      pink: '#efb6cd', lavender: '#c9bee9', blue: '#b7dce9', cream: '#fff0cb',
      peach: '#f1c8b3', mint: '#bcded0', dogFur: '#ead5bd', dogEar: '#bd9985',
    }).map(([key, color]) => [key, new MeshStandardMaterial({ color, roughness: 0.88 })]));
  }

  create(type) {
    if (!CUSTOMER_TYPES.includes(type)) throw new Error(`Animal desconhecido: ${type}`);
    const model = new Group(), body = new Group(), head = new Group();
    model.name = `customer-${type}`;
    model.add(body);
    const fur = ({ bear: 'brown', cat: 'peach', dog: 'dogFur' })[type] ?? 'white';
    const part = (parent, name, color, position, scale, geometry = this.geometry) => {
      const mesh = new Mesh(geometry, this.materials[color]);
      mesh.name = name; mesh.position.set(...position); mesh.scale.set(...scale);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    part(body, 'outfit', ({ rabbit: 'lavender', bear: 'blue', cat: 'mint', dog: 'pink' })[type] ?? 'white', [0, 0.65, 0], [0.34, 0.43, 0.25]);
    head.position.y = 1.23; body.add(head);
    part(head, 'head', fur, [0, 0, 0], [0.43, 0.38, 0.32]);
    const eyes = [], arms = [], legs = [], brows = [], ears = [];
    for (const side of [-1, 1]) {
      const earY = type === 'rabbit' ? 0.43 : 0.3;
      let ear;
      if (type === 'cat') {
        ear = part(head, 'ear', fur, [side * .28, .34, 0], [.19, .3, .15], this.triangle);
        part(head, 'inner-ear', 'pink', [side * .28, .34, .1], [.1, .17, .035], this.triangle);
        for (let i = 0; i < 2; i++) {
          const whisker = part(head, 'whisker', 'brown', [side * .36, -.06 - i * .06, .27], [.11, .008, .009]);
          whisker.rotation.z = side * (.12 - i * .24);
        }
      } else if (type === 'dog') {
        ear = part(head, 'floppy-ear', 'dogEar', [side * .4, .08, -.01], [.14, .29, .12]);
        ear.rotation.z = side * .18;
      } else ear = part(head, 'ear', type === 'panda' ? 'black' : fur, [side * .27, earY, 0], type === 'rabbit' ? [.115, .36, .1] : [.15, .16, .1]);
      ears.push({ mesh: ear, angle: ear.rotation.z });
      if (type === 'rabbit') part(head, 'inner-ear', 'pink', [side * 0.27, earY, 0.08], [0.06, 0.26, 0.025]);
      if (type === 'panda') part(head, 'eye-patch', 'black', [side * 0.17, 0.015, 0.284], [0.115, 0.14, 0.045]);
      eyes.push(part(head, 'eye', 'black', [side * 0.17, 0.025, 0.327], [0.033, 0.046, 0.025]));
      const brow = part(head, 'expression-brow', 'black', [side * 0.17, 0.12, 0.32], [0.055, 0.012, 0.014]);
      brow.visible = false; brows.push(brow);
      part(head, 'eye-sparkle', 'white', [side * 0.17 + 0.009, 0.041, 0.349], [0.009, 0.009, 0.007]);
      part(head, 'blush', 'pink', [side * 0.28, -0.09, 0.28], [0.064, 0.033, 0.018]);
      const arm = new Group(); arm.position.set(side * 0.32, 0.88, 0); body.add(arm);
      part(arm, 'arm', type === 'panda' ? 'black' : fur, [side * 0.045, -0.19, 0], [0.1, 0.23, 0.105]);
      arm.rotation.z = side * 0.14; arms.push(arm);
      const leg = new Group(); leg.position.set(side * 0.17, 0.32, 0); body.add(leg);
      part(leg, 'leg', type === 'panda' ? 'black' : fur, [0, -0.15, 0.035], [0.12, 0.18, 0.15]); legs.push(leg);
    }
    part(head, 'muzzle', type === 'bear' ? 'muzzle' : 'white', [0, -0.105, 0.29], [0.17, 0.105, 0.09]);
    part(head, 'nose', type === 'rabbit' ? 'pink' : 'black', [0, -0.055, 0.38], [0.041, 0.029, 0.025]);
    const mouth = part(head, 'mouth', 'black', [0, -0.135, 0.38], [0.025, 0.013, 0.008]);
    part(body, 'pastel-button', type === 'panda' ? 'pink' : 'cream', [0, 0.83, 0.25], [0.07, 0.07, 0.03]);
    if (type === 'dog') part(head, 'muzzle-freckle', 'brown', [.075, -.09, .377], [.012, .012, .008]);
    const satisfaction = new Group(); satisfaction.name = 'customer-satisfaction'; satisfaction.position.y = 1.73;
    part(satisfaction, 'heart-left', 'pink', [-.033, .035, 0], [.055, .05, .025]);
    part(satisfaction, 'heart-right', 'pink', [.033, .035, 0], [.055, .05, .025]);
    const tip = part(satisfaction, 'heart-tip', 'pink', [0, -.018, 0], [.075, .1, .025], this.triangle);
    tip.rotation.z = Math.PI;
    satisfaction.visible = false; model.add(satisfaction);
    return { model, body, head, eyes, arms, legs, brows, mouth, ears, satisfaction };
  }

  dispose() {
    this.geometry.dispose();
    this.triangle.dispose();
    Object.values(this.materials).forEach((material) => material.dispose());
  }
}

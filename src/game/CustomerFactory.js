import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';

export const CUSTOMER_TYPES = Object.freeze(['rabbit', 'bear', 'panda']);

// Recursos pertencem à fábrica; remover um cliente não invalida os demais.
export class CustomerFactory {
  constructor() {
    this.geometry = new SphereGeometry(1, 12, 8);
    this.materials = Object.fromEntries(Object.entries({
      white: '#fff9f3', brown: '#c99e7e', muzzle: '#f2d8ba', black: '#302d39',
      pink: '#efb6cd', lavender: '#c9bee9', blue: '#b7dce9', cream: '#fff0cb',
    }).map(([key, color]) => [key, new MeshStandardMaterial({ color, roughness: 0.88 })]));
  }

  create(type) {
    if (!CUSTOMER_TYPES.includes(type)) throw new Error(`Animal desconhecido: ${type}`);
    const model = new Group(), body = new Group(), head = new Group();
    model.name = `customer-${type}`;
    model.add(body);
    const fur = type === 'bear' ? 'brown' : 'white';
    const part = (parent, name, color, position, scale) => {
      const mesh = new Mesh(this.geometry, this.materials[color]);
      mesh.name = name; mesh.position.set(...position); mesh.scale.set(...scale);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    part(body, 'outfit', type === 'rabbit' ? 'lavender' : type === 'bear' ? 'blue' : 'white', [0, 0.65, 0], [0.34, 0.43, 0.25]);
    head.position.y = 1.23; body.add(head);
    part(head, 'head', fur, [0, 0, 0], [0.43, 0.38, 0.32]);
    const eyes = [], arms = [], legs = [], brows = [];
    for (const side of [-1, 1]) {
      const earY = type === 'rabbit' ? 0.43 : 0.3;
      part(head, 'ear', type === 'panda' ? 'black' : fur, [side * 0.27, earY, 0], type === 'rabbit' ? [0.115, 0.36, 0.1] : [0.15, 0.16, 0.1]);
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
    return { model, body, head, eyes, arms, legs, brows, mouth };
  }

  dispose() {
    this.geometry.dispose();
    Object.values(this.materials).forEach((material) => material.dispose());
  }
}

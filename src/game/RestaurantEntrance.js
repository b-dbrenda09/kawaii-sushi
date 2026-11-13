import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

export class RestaurantEntrance {
  constructor(route) {
    this.route = route;
    this.group = new Group(); this.group.name = 'restaurant-entrance';
    this.geometry = new BoxGeometry(1, 1, 1);
    this.materials = ['#f0b5cf', '#fff4e1', '#d9b78f', '#c5cbbb'].map(color => new MeshStandardMaterial({ color, roughness: .9 }));
    const { x, z } = route.door;
    for (const offset of [-1.12, 1.12]) this.box([x, 1.05, z + offset], [.18, 2.1, .16], 0);
    this.box([x, 2.12, z], [.32, .18, 2.5], 0);
    this.box([x, 2.2, z], [1.15, .12, 2.65], 0);
    this.box([x, 2.27, z], [.9, .08, 2.4], 1);
    this.box([x, -.04, z], [.65, .08, 2.35], 2);
    this.panels = [-1, 1].map(side => {
      const group = new Group(); group.position.set(x, 0, z + side * .5);
      this.group.add(group);
      this.box([0, 1, 0], [.07, 1.85, .95], 1, group);
      for (const y of [.13, .72, 1.32, 1.92]) this.box([0, y, 0], [.1, .045, .98], 0, group);
      for (const dz of [-.46, 0, .46]) this.box([0, 1, dz], [.1, 1.85, .035], 0, group);
      return { group, side };
    });
    // A raised board faces the camera, clear of counter positions and recipe UI.
    this.box([x - .15, 2.36, z], [2.35, .55, .12], 0);
    this.signGeometry = new PlaneGeometry(2.22, .48);
    this.signMaterial = new MeshBasicMaterial({ color: '#ffffff' });
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 168;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fff8f2'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#b65180'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 65px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
        ctx.fillText('Hello Kitty Sushi', 384, 86, 730);
        this.texture = new CanvasTexture(canvas); this.texture.colorSpace = SRGBColorSpace; this.signMaterial.map = this.texture;
      }
    }
    const sign = new Mesh(this.signGeometry, this.signMaterial);
    sign.name = 'hello-kitty-sushi-sign'; sign.userData.text = 'Hello Kitty Sushi';
    sign.position.set(x - .15, 2.36, z + .065); this.group.add(sign);
    // Continuous, level path from the garden to the existing customer floor.
    this.box([(route.outside.x + route.inside.x) / 2, -.06, z],
      [route.outside.x - route.inside.x + .8, .12, 1.15], 3);
    this.box([route.outside.x, -.06, (route.outside.z + z) / 2],
      [1.15, .12, route.outside.z - z + .9], 3);
    for (const dz of [-1.45, 1.45]) {
      this.box([x + .55, .1, z + dz], [.45, .4, .45], 0);
      this.box([x + .55, .34, z + dz], [.52, .13, .52], 1);
    }
    this.openAmount = 0;
  }

  box(position, scale, material, parent = this.group) {
    const mesh = new Mesh(this.geometry, this.materials[material]);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }

  update(dt, customers) {
    const nearby = [...customers].some(customer => customer.moving &&
      customer.model.position.distanceToSquared(this.route.door) < 2.4 ** 2);
    this.openAmount = Math.max(0, Math.min(1, this.openAmount + (nearby ? 1 : -1) * dt * 3));
    for (const { group, side } of this.panels) group.position.z = this.route.door.z + side * (.5 + this.openAmount * .99);
  }

  canPass(customer) {
    return customer.model.position.distanceToSquared(this.route.door) > .8 ** 2 || this.openAmount >= .98;
  }

  dispose() {
    this.group.removeFromParent(); this.geometry.dispose(); this.signGeometry.dispose();
    this.materials.forEach(material => material.dispose()); this.signMaterial.dispose(); this.texture?.dispose();
  }
}

import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Frente do modelo em +Z, pés em Y = 0. Não depende da orientação da câmera.
export class Player {
  constructor({ position = new Vector3(0, 0, 1), rotation = Math.PI / 4 } = {}) {
    this.group = new Group();
    this.group.name = 'hello-kitty';
    this.group.position.copy(position);
    this.group.rotation.y = rotation;
    this.elapsedTime = 0;
    this.maxSpeed = 3.5;
    this.acceleration = 12;
    this.deceleration = 16;
    this.turnSpeed = 12;
    this.velocity = new Vector3();
    this.targetVelocity = new Vector3();
    this.velocityOffset = new Vector3();
    this.disposed = false;
    this.geometries = new Set();
    this.materials = {
      white: this.material('#fffdfa'),
      black: this.material('#17151c', 0.6),
      yellow: this.material('#ffd326'),
      blue: this.material('#2464ce'),
      red: this.material('#e71939', 0.34),
    };
    // Uma esfera compartilhada mantém as superfícies suaves sem duplicar recursos.
    this.sphere = new SphereGeometry(1, 40, 28);
    this.geometries.add(this.sphere);

    this.body = this.part('upper-body', this.group, [0, 0.66, 0]);
    this.head = this.part('head', this.body, [0, 1.34, 0]);
    this.head.rotation.x = -0.08;
    this.leftArm = this.part('left-arm', this.body, [0.46, 0.6, 0]);
    this.rightArm = this.part('right-arm', this.body, [-0.46, 0.6, 0]);
    this.feet = this.part('feet', this.group);
    this.createBody();
    this.createHead();
    this.update(0);
  }

  material(color, roughness = 0.44) {
    return new MeshStandardMaterial({ color, roughness, metalness: 0 });
  }

  part(name, parent, position = [0, 0, 0]) {
    const group = new Group();
    group.name = name;
    group.position.set(...position);
    parent.add(group);
    return group;
  }

  mesh(name, parent, geometry, material, position, scale = [1, 1, 1]) {
    this.geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  oval(name, parent, material, position, scale) {
    return this.mesh(name, parent, this.sphere, material, position, scale);
  }

  curve(name, parent, points, radius, material) {
    const path = new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
    return this.mesh(name, parent, new TubeGeometry(path, 20, radius, 10, false), material, [0, 0, 0]);
  }

  createBody() {
    const { white, yellow, blue } = this.materials;
    for (const side of [-1, 1]) {
      this.oval(`foot-${side}`, this.feet, white, [side * 0.245, 0.18, 0.09], [0.245, 0.18, 0.32]);
      this.oval(`leg-${side}`, this.group, white, [side * 0.245, 0.37, 0], [0.15, 0.23, 0.17]);
      this.oval(`overall-leg-${side}`, this.group, blue, [side * 0.245, 0.55, 0], [0.235, 0.22, 0.285]);
    }
    this.oval('overall-bottom', this.group, blue, [0, 0.68, 0], [0.475, 0.32, 0.35]);
    this.oval('yellow-shirt', this.body, yellow, [0, 0.39, 0], [0.48, 0.46, 0.335]);
    this.mesh('overall-bib', this.body,
      new RoundedBoxGeometry(0.66, 0.5, 0.12, 5, 0.055), blue, [0, 0.31, 0.295]);
    this.mesh('overall-back', this.body,
      new RoundedBoxGeometry(0.64, 0.43, 0.1, 5, 0.045), blue, [0, 0.27, -0.295]);

    for (const side of [-1, 1]) {
      this.curve(`overall-strap-${side}`, this.body, [
        [side * 0.235, 0.46, 0.33], [side * 0.235, 0.68, 0.27],
        [side * 0.235, 0.79, 0], [side * 0.235, 0.65, -0.27],
        [side * 0.235, 0.4, -0.32],
      ], 0.065, blue);
      this.oval(`white-button-${side}`, this.body, white,
        [side * 0.235, 0.49, 0.39], [0.062, 0.062, 0.035]);
      const arm = side === 1 ? this.leftArm : this.rightArm;
      const sleeve = this.oval(`short-sleeve-${side}`, arm, yellow,
        [side * 0.085, -0.12, 0], [0.205, 0.245, 0.235]);
      sleeve.rotation.z = side * 0.32;
      this.oval(`white-hand-${side}`, arm, white,
        [side * 0.19, -0.355, 0.035], [0.19, 0.235, 0.205]);
    }
  }

  createHead() {
    const { white, black, yellow, red } = this.materials;
    this.oval('white-oval-head', this.head, white, [0, 0, 0], [0.93, 0.71, 0.65]);

    // Silhueta de orelha triangular com curvas e bordas chanfradas arredondadas.
    const ear = new Shape();
    ear.moveTo(-0.25, 0);
    ear.bezierCurveTo(-0.25, 0.18, -0.2, 0.45, -0.12, 0.49);
    ear.bezierCurveTo(-0.02, 0.53, 0.18, 0.23, 0.25, 0);
    ear.quadraticCurveTo(0, -0.12, -0.25, 0);
    const earGeometry = new ExtrudeGeometry(ear, {
      depth: 0.2, bevelEnabled: true, bevelThickness: 0.09,
      bevelSize: 0.065, bevelSegments: 5, curveSegments: 16, steps: 1,
    });
    earGeometry.translate(0, 0, -0.1);
    for (const side of [-1, 1]) {
      const mesh = this.mesh(`white-ear-${side}`, this.head, earGeometry, white,
        [side * 0.61, 0.43, -0.025]);
      mesh.rotation.z = -side * 0.12;
      this.oval(`black-eye-${side}`, this.head, black,
        [side * 0.35, -0.065, 0.614], [0.064, 0.097, 0.035]);

      for (let index = 0; index < 3; index++) {
        const height = (1 - index) * 0.175 - 0.08;
        const endHeight = height + (1 - index) * 0.085;
        const points = [
          [side * 0.68, height, 0.48],
          [side * 0.89, height + (1 - index) * 0.04, 0.43],
          [side * 1.08, endHeight, 0.35],
        ];
        this.curve(`whisker-${side}-${index}`, this.head, points, 0.022, black);
        this.oval(`whisker-tip-${side}-${index}`, this.head, black, points[2], [0.022, 0.022, 0.022]);
      }
    }
    this.oval('yellow-nose', this.head, yellow, [0, -0.2, 0.645], [0.092, 0.064, 0.045]);

    // +X é o lado esquerdo da personagem (direita de quem a vê de frente).
    this.bow = this.part('red-bow', this.head, [0.63, 0.48, 0.43]);
    this.bow.rotation.z = -0.22;
    for (const side of [-1, 1]) {
      const lobe = this.oval(`bow-lobe-${side}`, this.bow, red,
        [side * 0.205, 0.015, 0], [0.265, 0.245, 0.17]);
      lobe.rotation.z = side * 0.3;
    }
    this.oval('bow-knot', this.bow, red, [0, 0, 0.105], [0.14, 0.155, 0.145]);
  }

  updateMovement(deltaTime, direction) {
    this.targetVelocity.set(0, 0, 0);
    if (direction) this.targetVelocity.copy(direction).setY(0).clampLength(0, 1);
    this.targetVelocity.multiplyScalar(this.maxSpeed);
    const rate = this.targetVelocity.lengthSq() > 0 ? this.acceleration : this.deceleration;
    const decay = Math.exp(-rate * deltaTime);
    this.velocityOffset.copy(this.velocity).sub(this.targetVelocity);

    // Integral exata da aceleração exponencial, para percorrer a mesma distância em qualquer FPS.
    this.group.position.addScaledVector(this.targetVelocity, deltaTime);
    this.group.position.addScaledVector(this.velocityOffset, (1 - decay) / rate);
    this.velocity.copy(this.targetVelocity).addScaledVector(this.velocityOffset, decay);
    if (this.targetVelocity.lengthSq() === 0 && this.velocity.lengthSq() < 1e-8) {
      this.velocity.set(0, 0, 0);
    }

    if (this.velocity.lengthSq() > 1e-6) {
      // O rosto aponta em +Z no modelo original. Sempre usa o arco mais curto em Y.
      const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
      const difference = targetAngle - this.group.rotation.y;
      const shortestAngle = Math.atan2(Math.sin(difference), Math.cos(difference));
      this.group.rotation.y += shortestAngle * (1 - Math.exp(-this.turnSpeed * deltaTime));
    }
  }

  stopMoving() {
    this.velocity.set(0, 0, 0);
    this.targetVelocity.set(0, 0, 0);
    this.velocityOffset.set(0, 0, 0);
  }

  update(deltaTime, direction = null) {
    if (this.disposed) return;
    deltaTime = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.05) : 0;
    this.updateMovement(deltaTime, direction);
    this.elapsedTime = (this.elapsedTime + deltaTime) % (Math.PI * 2 / 1.8);
    const phase = this.elapsedTime * 1.8;
    // Movimento absoluto a partir do tempo: mesma pose para o mesmo tempo em qualquer FPS.
    this.body.position.y = 0.66 + (1 - Math.cos(phase)) * 0.012;
    this.body.rotation.z = 0;
    this.leftArm.rotation.z = 0.08 + Math.sin(phase) * 0.055;
    this.rightArm.rotation.z = -0.08 - Math.sin(phase + 0.25) * 0.055;
    // Pés e pernas fora do grupo animado: nunca atravessam o piso.
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMoving();
    this.group.removeFromParent();
    this.geometries.forEach((geometry) => geometry.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
    this.geometries.clear();
    this.group.clear();
  }
}

import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Box3,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CollisionSystem } from './CollisionSystem.js';
import { BALANCE } from './Balance.js';

// Frente do modelo em +Z, pés em Y = 0. Não depende da orientação da câmera.
export class Player {
  constructor({ position = new Vector3(0, 0, 1), rotation = Math.PI / 4,
    movementBounds = null, collisionSystem = null, colliderRadius = 0.52,
    dashSpeedMultiplier = BALANCE.player.dashSpeed / BALANCE.player.walkSpeed,
    dashDuration = BALANCE.player.dashDuration, dashCooldown = BALANCE.player.dashCooldown } = {}) {
    this.group = new Group();
    this.group.name = 'hello-kitty';
    this.group.position.copy(position);
    this.group.rotation.y = rotation;
    this.elapsedTime = 0;
    this.maxSpeed = BALANCE.player.walkSpeed;
    this.acceleration = 12;
    this.deceleration = 16;
    this.turnSpeed = 12;
    // Centro acompanha a raiz; o raio representa o corpo, sem cabeça ou laço.
    this.collider = { position: this.group.position, radius: colliderRadius };
    this.collisionSystem = collisionSystem;
    this.ownsCollisionSystem = false;
    // Compatibilidade com consumidores antigos: os limites eram do centro.
    if (!collisionSystem && movementBounds) {
      this.collisionSystem = new CollisionSystem({ bounds: {
        minX: movementBounds.minX - colliderRadius, maxX: movementBounds.maxX + colliderRadius,
        minZ: movementBounds.minZ - colliderRadius, maxZ: movementBounds.maxZ + colliderRadius,
      } });
      this.ownsCollisionSystem = true;
    }
    this.displacement = new Vector3();
    this.dashSpeedMultiplier = dashSpeedMultiplier;
    this.dashDuration = dashDuration;
    this.dashCooldown = dashCooldown;
    this.dashRemaining = 0;
    this.cooldownRemaining = 0;
    this.dashDirection = new Vector3();
    this.state = 'idle';
    this.walkPhase = 0;
    this.walkWeight = 0;
    this.actualSpeed = 0;
    this.previousPosition = new Vector3();
    this.footBounds = new Box3();
    this.trails = [];
    this.trailClock = 0;
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
    this.carryAnchor = this.part('carry-anchor', this.body, [0, 0.5, 0.67]);
    this.carryWeight = 0;
    this.cutAction = null;
    this.cutPose = null;
    this.cutWeight = 0;
    this.cutRecoverySpeed = 16;
    this.feet = this.part('feet', this.group);
    this.leftLeg = this.part('left-hip', this.feet, [0.245, 0.62, 0]);
    this.rightLeg = this.part('right-hip', this.feet, [-0.245, 0.62, 0]);
    this.createBody();
    this.createHead();
    for (let i = 0; i < 8; i++) {
      const material = new MeshBasicMaterial({ color: i % 2 ? '#cceafa' : '#f9cfe5', transparent: true, opacity: 0, depthWrite: false });
      this.materials[`trail-${i}`] = material;
      const mesh = this.mesh(`dash-trail-${i}`, this.group, this.sphere, material, [0, 0.25, 0], [0.09, 0.09, 0.09]);
      mesh.castShadow = false;
      mesh.visible = false;
      this.trails.push({ mesh, age: 1, position: new Vector3() });
    }
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
      const hip = side === 1 ? this.leftLeg : this.rightLeg;
      this.oval(`foot-${side}`, hip, white, [0, -0.44, 0.09], [0.245, 0.18, 0.32]);
      this.oval(`leg-${side}`, hip, white, [0, -0.25, 0], [0.15, 0.23, 0.17]);
      this.oval(`overall-leg-${side}`, hip, blue, [0, -0.07, 0], [0.235, 0.22, 0.285]);
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
    if (this.dashRemaining > 0) {
      this.targetVelocity.copy(this.dashDirection).multiplyScalar(this.maxSpeed * this.dashSpeedMultiplier);
      this.velocity.copy(this.targetVelocity);
    }
    const rate = this.targetVelocity.lengthSq() > 0 ? this.acceleration : this.deceleration;
    const decay = Math.exp(-rate * deltaTime);
    this.velocityOffset.copy(this.velocity).sub(this.targetVelocity);

    // Integral exata da aceleração exponencial, para percorrer a mesma distância em qualquer FPS.
    this.displacement.copy(this.targetVelocity).multiplyScalar(deltaTime);
    this.displacement.addScaledVector(this.velocityOffset, (1 - decay) / rate);
    this.velocity.copy(this.targetVelocity).addScaledVector(this.velocityOffset, decay);
    if (this.collisionSystem) {
      const result = this.collisionSystem.move(this.group.position, this.displacement, this.collider.radius);
      if (result.blockedX) this.velocity.x = 0;
      if (result.blockedZ) this.velocity.z = 0;
    } else this.group.position.add(this.displacement);
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
    this.dashRemaining = 0;
    this.state = 'idle';
    this.velocity.set(0, 0, 0);
    this.targetVelocity.set(0, 0, 0);
    this.velocityOffset.set(0, 0, 0);
  }

  get movementLocked() { return this.cutAction !== null; }

  beginCutting(target, { recoverySpeed = 16, aimFraction = 0.35 } = {}) {
    if (this.disposed || this.movementLocked || this.dashRemaining > 0 || this.carryAnchor.children.length) return false;
    this.stopMoving();
    const angle = Math.atan2(target.x - this.group.position.x, target.z - this.group.position.z);
    const difference = angle - this.group.rotation.y;
    this.cutAction = { startAngle: this.group.rotation.y,
      angleOffset: Math.atan2(Math.sin(difference), Math.cos(difference)), progress: 0, aimFraction };
    this.cutPose = this.cutAction;
    this.cutRecoverySpeed = recoverySpeed;
    this.state = 'cutting';
    return true;
  }

  setCuttingProgress(progress) {
    if (!this.cutAction) return;
    this.cutAction.progress = Math.max(0, Math.min(1, progress));
    const aim = Math.min(this.cutAction.progress / this.cutAction.aimFraction, 1);
    this.group.rotation.y = this.cutAction.startAngle + this.cutAction.angleOffset * aim * aim * (3 - 2 * aim);
  }

  endCutting() {
    if (!this.cutAction) return;
    this.cutAction = null;
    this.stopMoving();
  }

  animateCutting(deltaTime) {
    const pose = this.cutPose;
    this.cutWeight += ((this.movementLocked ? 1 : 0) - this.cutWeight)
      * (1 - Math.exp(-(this.movementLocked ? 24 : this.cutRecoverySpeed) * deltaTime));
    if (!pose) return;
    const smooth = (value) => value * value * (3 - 2 * value);
    const q = Math.max(0, (pose.progress - pose.aimFraction) / (1 - pose.aimFraction));
    const right = q < 0.35 ? -1.05 - 0.7 * smooth(q / 0.35)
      : q < 0.6 ? -1.75 + 0.9 * smooth((q - 0.35) / 0.25)
        : -0.85 - 0.2 * smooth((q - 0.6) / 0.4);
    const w = this.cutWeight;
    this.rightArm.rotation.x += (right - this.rightArm.rotation.x) * w;
    this.leftArm.rotation.x += (-1.1 - this.leftArm.rotation.x) * w;
    this.leftArm.rotation.z += (-0.5 - this.leftArm.rotation.z) * w;
    this.rightArm.rotation.z += (0.5 - this.rightArm.rotation.z) * w;
    this.body.rotation.x += (0.075 - this.body.rotation.x) * w;
    if (!this.movementLocked && w < 1e-5) { this.cutWeight = 0; this.cutPose = null; }
  }

  update(deltaTime, direction = null, dashPressed = false) {
    if (this.disposed) return;
    deltaTime = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.05) : 0;
    const locked = this.movementLocked;
    if (!locked && dashPressed && this.cooldownRemaining <= 1e-8 && direction?.lengthSq() > 0) {
      this.dashDirection.copy(direction).setY(0).normalize();
      this.dashRemaining = this.dashDuration;
      this.cooldownRemaining = this.dashCooldown;
    }
    this.previousPosition.copy(this.group.position);
    const dashStep = Math.min(deltaTime, this.dashRemaining);
    if (!locked && dashStep > 0) this.updateMovement(dashStep, this.dashDirection);
    this.dashRemaining = Math.max(0, this.dashRemaining - dashStep);
    if (!locked && deltaTime > dashStep) this.updateMovement(deltaTime - dashStep, direction);
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaTime);
    this.actualSpeed = deltaTime > 0 ? this.group.position.distanceTo(this.previousPosition) / deltaTime : 0;
    this.state = locked ? 'cutting' : this.dashRemaining > 0 ? 'dashing' : this.actualSpeed > 0.01 ? 'walking' : 'idle';
    this.elapsedTime = (this.elapsedTime + deltaTime) % (Math.PI * 2 / 1.8);
    const phase = this.elapsedTime * 1.8;
    // Movimento absoluto a partir do tempo: mesma pose para o mesmo tempo em qualquer FPS.
    const blend = 1 - Math.exp(-16 * deltaTime);
    this.walkWeight += (Math.min(this.actualSpeed / this.maxSpeed, 1) - this.walkWeight) * blend;
    this.walkPhase = (this.walkPhase + this.actualSpeed * deltaTime * 3.6) % (Math.PI * 2);
    const swing = Math.sin(this.walkPhase) * this.walkWeight;
    this.body.position.y = 0.66 + (1 - Math.cos(phase)) * 0.012 + Math.abs(swing) * 0.025;
    const lean = this.state === 'dashing' ? 0.16 : 0;
    const leanAngle = Math.atan2(this.dashDirection.x, this.dashDirection.z) - this.group.rotation.y;
    this.body.rotation.x += (Math.cos(leanAngle) * lean - this.body.rotation.x) * blend;
    this.body.rotation.z += (-Math.sin(leanAngle) * lean - this.body.rotation.z) * blend;
    this.carryWeight += ((this.carryAnchor.children.length ? 1 : 0) - this.carryWeight) * blend;
    const freeWeight = 1 - this.carryWeight;
    this.leftArm.rotation.z = (-0.08 + Math.sin(phase) * 0.025) * freeWeight - 0.7 * this.carryWeight;
    this.rightArm.rotation.z = (0.08 - Math.sin(phase) * 0.025) * freeWeight + 0.7 * this.carryWeight;
    this.leftArm.rotation.x = swing * 0.55 * freeWeight - 1.12 * this.carryWeight;
    this.rightArm.rotation.x = -swing * 0.55 * freeWeight - 1.12 * this.carryWeight;
    this.leftLeg.rotation.x = -swing * 0.38;
    this.rightLeg.rotation.x = swing * 0.38;
    this.animateCutting(deltaTime);
    // Levanta apenas o necessário para que a geometria rotacionada não atravesse o piso.
    for (const hip of [this.leftLeg, this.rightLeg]) {
      hip.position.y = 0.62;
      this.group.updateMatrixWorld(true);
      const bottom = this.footBounds.setFromObject(hip).min.y;
      hip.position.y += Math.max(0, this.group.position.y - bottom);
    }
    this.updateTrails(deltaTime);
    // Os pivôs preservam os offsets originais de pernas, pés e roupas.
  }

  updateTrails(deltaTime) {
    this.trailClock += deltaTime;
    if (this.state === 'dashing' && this.actualSpeed > 0.1 && this.trailClock >= 0.025) {
      const trail = this.trails.find((entry) => entry.age >= 0.28);
      if (trail) {
        trail.age = 0;
        trail.position.copy(this.group.position).addScaledVector(this.dashDirection, -0.35);
        trail.position.y += 0.3;
      }
      this.trailClock = 0;
    }
    this.group.updateMatrixWorld(true);
    for (const trail of this.trails) {
      trail.age += deltaTime;
      trail.mesh.visible = trail.age < 0.28;
      if (!trail.mesh.visible) continue;
      trail.mesh.position.copy(trail.position);
      this.group.worldToLocal(trail.mesh.position);
      trail.mesh.material.opacity = (1 - trail.age / 0.28) * 0.4;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMoving();
    this.cutAction = null;
    this.cutPose = null;
    if (this.ownsCollisionSystem) this.collisionSystem.dispose();
    this.group.removeFromParent();
    this.geometries.forEach((geometry) => geometry.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
    this.geometries.clear();
    this.group.clear();
  }
}

import { Box3, Box3Helper, BufferGeometry, Group, LineBasicMaterial, LineLoop, Vector3 } from 'three';

const EPSILON = 1e-9;

// Colisão no plano XZ: círculo contra retângulos alinhados aos eixos.
export class CollisionSystem {
  constructor({ bounds = null, maxStep = 0.1 } = {}) {
    if (!Number.isFinite(maxStep) || maxStep <= 0) throw new Error('maxStep deve ser positivo.');
    this.bounds = bounds ? this.validateBounds(bounds) : null;
    this.maxStep = maxStep;
    this.obstacles = new Map();
    this.result = { blockedX: false, blockedZ: false };
    this.debugGroup = null;
    this.debugCollider = null;
    this.debugRadius = null;
  }

  validateBounds(bounds) {
    const { minX, maxX, minZ, maxZ } = bounds;
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ) {
      throw new Error('Limites de colisão inválidos.');
    }
    return { minX, maxX, minZ, maxZ };
  }

  registerObstacle({ id, position, width, depth, bounds }) {
    if (typeof id !== 'string' || !id) throw new Error('Obstáculo precisa de ID.');
    if (!bounds && (!position || ![position.x, position.z, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0)) {
      throw new Error('Posição e dimensões do obstáculo inválidas.');
    }
    const limits = this.validateBounds(bounds ?? {
      minX: position.x - width / 2, maxX: position.x + width / 2,
      minZ: position.z - depth / 2, maxZ: position.z + depth / 2,
    });
    const obstacle = { id, ...limits };
    this.obstacles.set(id, obstacle);
    this.clearDebug();
    return obstacle;
  }

  removeObstacle(id) {
    const removed = this.obstacles.delete(id);
    if (removed) this.clearDebug();
    return removed;
  }

  hasLineOfSight(start, end, ignoreId = null) {
    // Consulta os mesmos volumes da movimentação, sem alterar posição ou velocidade.
    if (![start.x, start.z, end.x, end.z].every(Number.isFinite)) return false;
    if (this.bounds) {
      for (const point of [start, end]) {
        if (point.x < this.bounds.minX || point.x > this.bounds.maxX
          || point.z < this.bounds.minZ || point.z > this.bounds.maxZ) return false;
      }
    }
    for (const obstacle of this.obstacles.values()) {
      if (obstacle.id === ignoreId) continue;
      let enter = 0;
      let exit = 1;
      for (const axis of ['x', 'z']) {
        const low = obstacle[axis === 'x' ? 'minX' : 'minZ'];
        const high = obstacle[axis === 'x' ? 'maxX' : 'maxZ'];
        const delta = end[axis] - start[axis];
        if (Math.abs(delta) < EPSILON) {
          if (start[axis] < low || start[axis] > high) { enter = Infinity; break; }
          continue;
        }
        const a = (low - start[axis]) / delta;
        const b = (high - start[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (enter > exit) break;
      }
      if (enter <= exit && exit >= 0 && enter <= 1) return false;
    }
    return true;
  }

  // A seção do retângulo expandido pelo círculo é calculada analiticamente.
  // Cada eixo varre todo o trecho: mesmo uma parede fina não pode ser saltada.
  resolveAxis(position, amount, axis, radius) {
    if (amount === 0) return 0;
    const other = axis === 'x' ? 'z' : 'x';
    const minKey = axis === 'x' ? 'minX' : 'minZ';
    const maxKey = axis === 'x' ? 'maxX' : 'maxZ';
    const otherMin = other === 'x' ? 'minX' : 'minZ';
    const otherMax = other === 'x' ? 'maxX' : 'maxZ';
    const start = position[axis];
    let end = start + amount;
    if (this.bounds) {
      end = Math.max(this.bounds[minKey] + radius, Math.min(this.bounds[maxKey] - radius, end));
    }
    for (const obstacle of this.obstacles.values()) {
      const distance = Math.max(obstacle[otherMin] - position[other], 0, position[other] - obstacle[otherMax]);
      if (distance >= radius) continue;
      const reach = Math.sqrt(Math.max(0, radius * radius - distance * distance));
      const low = obstacle[minKey] - reach;
      const high = obstacle[maxKey] + reach;
      if (amount > 0 && start <= low + EPSILON && end > low) end = Math.max(start, low);
      if (amount < 0 && start >= high - EPSILON && end < high) end = Math.min(start, high);
    }
    position[axis] = end;
    return end - start;
  }

  move(position, displacement, radius) {
    if (![position.x, position.z, displacement.x, displacement.z, radius].every(Number.isFinite) || radius <= 0) {
      throw new Error('Movimento ou raio de colisão inválido.');
    }
    if (this.bounds && (2 * radius > this.bounds.maxX - this.bounds.minX || 2 * radius > this.bounds.maxZ - this.bounds.minZ)) {
      throw new Error('Collider maior que a área jogável.');
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(displacement.x, displacement.z) / Math.min(this.maxStep, radius / 2)));
    const dx = displacement.x / steps;
    const dz = displacement.z / steps;
    this.result.blockedX = false;
    this.result.blockedZ = false;
    for (let i = 0; i < steps; i++) {
      const movedX = this.resolveAxis(position, dx, 'x', radius);
      const movedZ = this.resolveAxis(position, dz, 'z', radius);
      this.result.blockedX ||= Math.abs(movedX - dx) > EPSILON;
      this.result.blockedZ ||= Math.abs(movedZ - dz) > EPSILON;
    }
    return this.result;
  }

  updateDebug(scene, collider, enabled = false) {
    if (!enabled) {
      if (this.debugGroup) this.debugGroup.visible = false;
      return;
    }
    if (this.debugGroup && this.debugRadius !== collider.radius) this.clearDebug();
    if (!this.debugGroup) {
      this.debugGroup = new Group();
      this.debugGroup.name = 'collision-debug';
      const addBox = (bounds, color, height) => {
        const box = new Box3(new Vector3(bounds.minX, 0.015, bounds.minZ), new Vector3(bounds.maxX, height, bounds.maxZ));
        this.debugGroup.add(new Box3Helper(box, color));
      };
      if (this.bounds) addBox(this.bounds, '#9ae6ba', 0.025);
      for (const obstacle of this.obstacles.values()) addBox(obstacle, '#edb4da', 0.6);
      const points = Array.from({ length: 64 }, (_, i) => {
        const angle = i * Math.PI * 2 / 64;
        return new Vector3(Math.cos(angle) * collider.radius, 0.03, Math.sin(angle) * collider.radius);
      });
      this.debugCollider = new LineLoop(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: '#67c9ef', depthTest: false }));
      this.debugCollider.renderOrder = 10;
      this.debugRadius = collider.radius;
      this.debugGroup.add(this.debugCollider);
      scene.add(this.debugGroup);
    }
    this.debugGroup.visible = true;
    this.debugCollider.position.set(collider.position.x, 0, collider.position.z);
  }

  clearDebug() {
    this.debugGroup?.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    this.debugGroup?.removeFromParent();
    this.debugGroup = null;
    this.debugCollider = null;
  }

  dispose() {
    this.clearDebug();
    this.obstacles.clear();
  }
}

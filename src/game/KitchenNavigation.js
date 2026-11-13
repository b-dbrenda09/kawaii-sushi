import { Vector3 } from 'three';

const CELL = 0.28;
const MARGIN = 0.06;
const NEIGHBORS = [-1, 0, 1].flatMap(z => [-1, 0, 1].map(x => [x, z]))
  .filter(([x, z]) => x || z);

function crosses(start, end, box) {
  if ((start.x <= box.minX && end.x <= box.minX) || (start.x >= box.maxX && end.x >= box.maxX)
    || (start.z <= box.minZ && end.z <= box.minZ) || (start.z >= box.maxZ && end.z >= box.maxZ)) return false;
  const dx = end.x - start.x, dz = end.z - start.z;
  const x1 = dx ? (box.minX - start.x) / dx : -Infinity;
  const x2 = dx ? (box.maxX - start.x) / dx : Infinity;
  const z1 = dz ? (box.minZ - start.z) / dz : -Infinity;
  const z2 = dz ? (box.maxZ - start.z) / dz : Infinity;
  return Math.max(0, Math.min(x1, x2), Math.min(z1, z2)) <
    Math.min(1, Math.max(x1, x2), Math.max(z1, z2));
}

function expand(box, radius) {
  return { minX: box.minX - radius, maxX: box.maxX + radius,
    minZ: box.minZ - radius, maxZ: box.maxZ + radius };
}

export class KitchenNavigation {
  constructor(collisions, player) {
    this.collisions = collisions;
    this.player = player;
    this.radius = player.collider.radius;
    this.bounds = expand(collisions.bounds, -this.radius - MARGIN);
    this.columns = Math.ceil((this.bounds.maxX - this.bounds.minX) / CELL) + 1;
    this.rows = Math.ceil((this.bounds.maxZ - this.bounds.minZ) / CELL) + 1;
    this.dx = (this.bounds.maxX - this.bounds.minX) / (this.columns - 1);
    this.dz = (this.bounds.maxZ - this.bounds.minZ) / (this.rows - 1);
    this.points = Array.from({ length: this.columns * this.rows }, (_, index) =>
      new Vector3(this.bounds.minX + (index % this.columns) * this.dx, 0,
        this.bounds.minZ + Math.floor(index / this.columns) * this.dz));
  }

  clamp(point) {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    return new Vector3(Math.max(minX, Math.min(maxX, point.x)), 0, Math.max(minZ, Math.min(maxZ, point.z)));
  }

  updateGrid(solids, padding) {
    if (this.staticSolids?.length === solids.length && solids.every((box, i) => box === this.staticSolids[i])) return;
    this.staticSolids = solids;
    this.staticBoxes = solids.map(box => expand(box, padding));
    this.freeCells = this.points.map(point => !this.staticBoxes.some(box => crosses(point, point, box)));
    this.edges = new Int8Array(this.points.length * NEIGHBORS.length);
  }

  edgeIsClear(from, to, neighbor) {
    const key = from * NEIGHBORS.length + neighbor;
    if (!this.edges[key]) {
      const blocked = this.staticBoxes.some(box => crosses(this.points[from], this.points[to], box));
      this.edges[key] = blocked ? -1 : 1;
      this.edges[(to + 1) * NEIGHBORS.length - 1 - neighbor] = this.edges[key];
    }
    return this.edges[key] === 1;
  }

  findRoute(position, requested, accepts = null) {
    const start = new Vector3(position.x, 0, position.z);
    const goal = this.clamp(requested);
    const padding = this.radius + MARGIN;
    this.updateGrid([...this.collisions.obstacles.values()], padding);
    const solids = [...this.staticSolids];
    const movingBoxes = [];
    for (const other of this.collisions.players) {
      if (other === this.player) continue;
      const { x, z } = other.group.position;
      const center = { minX: x, maxX: x, minZ: z, maxZ: z };
      solids.push(center);
      movingBoxes.push(expand(center, padding + other.collider.radius));
    }
    const boxes = [...this.staticBoxes, ...movingBoxes];
    const clear = (a, b) => !boxes.some(box => crosses(a, b, box));
    const free = point => clear(point, point);
    // Ao tocar um obstáculo, a física ainda permite sair da margem de navegação.
    const canLeave = point => !boxes.some((box, index) => {
      if (!crosses(start, point, box)) return false;
      if (!crosses(start, start, box)) return true;
      const solid = solids[index];
      const normalX = start.x - Math.max(solid.minX, Math.min(solid.maxX, start.x));
      const normalZ = start.z - Math.max(solid.minZ, Math.min(solid.maxZ, start.z));
      return (point.x - start.x) * normalX + (point.z - start.z) * normalZ <= 0;
    });
    const goalFree = !accepts && free(goal);
    if (goalFree && canLeave(goal)) return [goal];
    const available = this.freeCells.map((free, index) =>
      free && !movingBoxes.some(box => crosses(this.points[index], this.points[index], box)));
    const targets = accepts && this.points.map((point, index) => available[index] && accepts(point));
    if (targets && !targets.some(Boolean)) return [];
    const goalDistances = this.points.map(point => point.distanceTo(goal));
    let nearest = -1, nearestDistance = Infinity;
    if (!accepts && !goalFree) this.points.forEach((point, index) => {
      if (!available[index]) return;
      const distance = goalDistances[index];
      if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
    });
    const costs = new Float64Array(this.points.length).fill(Infinity);
    const previous = new Int32Array(this.points.length).fill(-1);
    const open = new Set();
    const estimate = nearest < 0 ? goalDistances : this.points.map(point => point.distanceTo(this.points[nearest]));
    this.points.forEach((point, index) => {
      const distance = point.distanceTo(start);
      if ((distance > CELL * 4 && !targets?.[index]) || !available[index] || !canLeave(point)) return;
      costs[index] = distance;
      open.add(index);
    });
    let closest = -1, closestDistance = Infinity, reached = false;
    while (open.size) {
      let current = -1, priority = Infinity;
      for (const index of open) {
        const score = costs[index] + (accepts ? 0 : estimate[index]);
        if (score < priority) { current = index; priority = score; }
      }
      open.delete(current);
      const point = this.points[current];
      if (targets?.[current]) { closest = current; break; }
      const distance = goalDistances[current];
      if (!accepts && distance < closestDistance) { closest = current; closestDistance = distance; }
      if (goalFree && clear(point, goal)) { closest = current; reached = true; break; }
      if (current === nearest) { closest = current; break; }
      const column = current % this.columns, row = Math.floor(current / this.columns);
      for (let i = 0; i < NEIGHBORS.length; i++) {
        const [x, z] = NEIGHBORS[i];
        const col = column + x, line = row + z;
        if (col < 0 || col >= this.columns || line < 0 || line >= this.rows) continue;
        const next = line * this.columns + col;
        if (!available[next]) continue;
        if (x && z && (!available[current + x] || !available[current + z * this.columns])) continue;
        const cost = costs[current] + point.distanceTo(this.points[next]);
        if (cost >= costs[next] || !this.edgeIsClear(current, next, i)
          || movingBoxes.some(box => crosses(point, this.points[next], box))) continue;
        costs[next] = cost;
        previous[next] = current;
        open.add(next);
      }
    }
    if (closest < 0) return [];
    const route = reached ? [goal] : [];
    for (let index = closest; index >= 0; index = previous[index]) route.push(this.points[index]);
    route.reverse();
    const smooth = [];
    for (let from = -1; from < route.length - 1;) {
      let next = route.length - 1;
      const origin = from < 0 ? start : route[from];
      while (next > from + 1 && !clear(origin, route[next])) next--;
      smooth.push(route[next]);
      from = next;
    }
    return smooth;
  }
}

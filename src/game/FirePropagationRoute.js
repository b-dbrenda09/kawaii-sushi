import { Vector3 } from 'three';
import { KitchenNavigation } from './KitchenNavigation.js';

// Reuse the kitchen pathfinder with a small visual clearance and no moving players.
// Only the origin and destination furniture are excluded: the trail connects their surfaces.
export class FirePropagationRoute {
  constructor(stations, collisions = null) {
    this.stations = stations;
    this.collisions = collisions ?? { bounds: { minX: -10.8, maxX: 10.8, minZ: -7, maxZ: 11 },
      obstacles: new Map([...stations.values()].map(s => [s.id, { id: s.id, ...s.collider.bounds }])), players: [] };
    this.agent = { collider: { radius: .1 } };
    this.cache = new Map();
  }
  path(source, target) {
    let changed = this.snapshot?.size !== this.collisions.obstacles.size;
    if (!changed) for (const [id, box] of this.collisions.obstacles) if (this.snapshot.get(id) !== box) { changed = true; break; }
    if (changed) { this.snapshot = new Map(this.collisions.obstacles); this.cache.clear(); }
    const key = `${source.id}:${target.id}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const obstacles = new Map([...this.collisions.obstacles].filter(([id]) => id !== source.id && id !== target.id));
    const navigation = new KitchenNavigation({ bounds: this.collisions.bounds, obstacles, players: [] }, this.agent);
    const points = navigation.findRoute(source.position, target.position);
    if (!points.length || points.at(-1).distanceTo(target.position) > .01) { this.cache.set(key, null); return null; }
    const path = [source.position.clone(), ...points.map(p => p.clone())];
    path.forEach(p => { p.y = .14; });
    path[0].y = source.dimensions.height + .1;
    path.at(-1).y = target.dimensions.height + .1;
    this.cache.set(key, path); return path;
  }
  valid(source, target, path) {
    // A newly dropped extinguisher may block a previously reserved corridor.
    const fresh = this.path(source, target);
    if (!fresh || fresh.length !== path.length) return false;
    return fresh.every((p, i) => p.distanceToSquared(path[i]) < 1e-8);
  }
}

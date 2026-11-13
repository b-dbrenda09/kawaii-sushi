import { Box3, CircleGeometry, Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { KitchenNavigation } from './KitchenNavigation.js';

const REPLAN_MS = 180;
const DESTINATION_CHANGE = 0.22;
const ARRIVAL_DISTANCE = 0.075;

export class MouseNavigation {
  constructor(camera, canvas, player, scene, obstacles) {
    this.camera = camera;
    this.canvas = canvas;
    this.player = player;
    this.navigation = new KitchenNavigation(player.collisionSystem, player);
    this.pointer = null;
    this.raycaster = new Raycaster();
    this.floor = new Plane(new Vector3(0, 1, 0), 0);
    this.ndc = new Vector2();
    this.destination = new Vector3();
    this.hit = new Vector3();
    this.obstacles = obstacles.filter(({ top, bounds }) => top > 0 && bounds)
      .map(({ id, top, bounds, dynamicStation }) => ({ id, dynamicStation, box: new Box3(new Vector3(bounds.minX, 0, bounds.minZ),
        new Vector3(bounds.maxX, top, bounds.maxZ)) }));
    this.planned = new Vector3();
    this.progress = new Vector3();
    this.otherAtPlan = new Vector3();
    this.marker = new Mesh(new CircleGeometry(0.16, 28),
      new MeshBasicMaterial({ color: 0xf58abd, transparent: true, opacity: 0.55, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);
    this.stationMarker = new Mesh(new CircleGeometry(0.19, 28),
      new MeshBasicMaterial({ color: 0xf58abd, transparent: true, opacity: 0.75, depthWrite: false }));
    this.stationMarker.rotation.x = -Math.PI / 2;
    scene.add(this.stationMarker);
    this.clearRoute();
  }

  track(event) {
    if (event.pointerType !== 'mouse') return;
    this.pointer = { x: event.clientX, y: event.clientY };
  }

  steer(direction, now = performance.now()) {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.pointer ?? {};
    if (!(x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom)
      || this.canvas.ownerDocument.elementFromPoint(x, y) !== this.canvas) {
      this.clearRoute();
      return direction;
    }
    this.ndc.set(2 * (x - rect.left) / rect.width - 1, 1 - 2 * (y - rect.top) / rect.height);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.floor, this.destination)) {
      this.clearRoute();
      return direction;
    }
    // Um cursor sobre a bancada aponta para o seu volume, mesmo com o piso oculto atrás.
    const ray = this.raycaster.ray;
    let nearest = ray.origin.distanceToSquared(this.destination);
    let pointedStation = null;
    for (const { id, box, dynamicStation } of this.obstacles) {
      if (dynamicStation) {
        if (!dynamicStation.interactionEnabled) continue;
        const b = dynamicStation.collider.bounds;
        box.min.set(b.minX, 0, b.minZ); box.max.set(b.maxX, dynamicStation.collider.top, b.maxZ);
      }
      if (!ray.intersectBox(box, this.hit)) continue;
      const distance = ray.origin.distanceToSquared(this.hit);
      if (distance >= nearest) continue;
      nearest = distance;
      pointedStation = this.interactions?.stations.get(id)?.station ?? null;
      this.destination.copy(this.hit).setY(0);
    }
    if (this.station?.interactionEnabled === false) { this.clearRoute(); pointedStation = null; }
    if (pointedStation && this.station && pointedStation !== this.station) {
      if (this.pendingStation !== pointedStation) {
        this.pendingStation = pointedStation;
        this.stationChangedAt = now;
      }
      if (now - this.stationChangedAt < REPLAN_MS) pointedStation = this.station;
    } else {
      this.pendingStation = null;
    }
    if (pointedStation !== this.station) {
      this.station = pointedStation;
      this.route = [];
      this.marker.visible = false;
      this.needsRoute = true;
      this.player.stopMoving();
      this.stationMarker.visible = Boolean(this.station);
      if (this.station) this.stationMarker.position.copy(this.station.position).setY(this.station.collider.top + 0.08);
    }
    const position = this.player.group.position;
    if (this.player.dashRemaining > 0) {
      this.needsRoute = true;
      return direction;
    }
    if (this.progress.distanceToSquared(position) > 0.12 ** 2) {
      this.progress.copy(position);
      this.progressAt = now;
    }
    const stalled = this.route.length > 0 && now - this.progressAt > 420;
    const moved = !this.station && this.planned.distanceToSquared(this.destination) > DESTINATION_CHANGE ** 2;
    const other = this.player.collisionSystem.players.find(player => player !== this.player)?.group.position;
    const passageMayBeFree = this.usedFallback && !this.route.length && other
      && (this.station || this.otherAtPlan.distanceToSquared(position) < 16 || this.otherAtPlan.distanceToSquared(this.destination) < 16)
      && other.distanceToSquared(this.otherAtPlan) > (this.station ? .12 : .55) ** 2;
    if (now - this.lastPlan >= REPLAN_MS && (this.needsRoute || moved || stalled || passageMayBeFree)) {
      const station = this.station;
      const accepts = station && (point => this.interactions.canApproach(station, this.player, point));
      this.route = this.navigation.findRoute(position, station?.position ?? this.destination, accepts);
      this.planned.copy(this.destination);
      this.progress.copy(position);
      this.progressAt = now;
      this.lastPlan = now;
      this.needsRoute = false;
      const end = this.route.at(-1);
      this.usedFallback = !end || (!station && end.distanceToSquared(this.navigation.clamp(this.destination)) > 1e-8);
      if (other) this.otherAtPlan.copy(other);
      this.marker.visible = Boolean(end);
      if (end) this.marker.position.set(end.x, 0.018, end.z);
    }
    while (this.route.length && position.distanceTo(this.route[0]) <= ARRIVAL_DISTANCE) {
      if (this.station && this.route.length === 1 && position.distanceTo(this.route[0]) > 0.01
        && !this.interactions.canApproach(this.station, this.player, position)) break;
      this.route.shift();
    }
    const next = this.route[0];
    if (next) {
      direction.subVectors(next, position).setY(0);
      const brakingDistance = Math.max(.22, this.player.maxSpeed * .14);
      return direction.clampLength(0, brakingDistance).divideScalar(brakingDistance);
    }
    this.player.stopMoving();
    return direction;
  }

  clearRoute() {
    this.station = null;
    this.pendingStation = null;
    this.stationMarker.visible = false;
    this.route = [];
    this.lastPlan = -Infinity;
    this.needsRoute = true;
    this.usedFallback = false;
    this.marker.visible = false;
  }

  dispose() {
    this.marker.removeFromParent();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
    this.stationMarker.removeFromParent();
    this.stationMarker.geometry.dispose();
    this.stationMarker.material.dispose();
  }
}

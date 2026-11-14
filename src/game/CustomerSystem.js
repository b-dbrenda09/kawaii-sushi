import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { CustomerFactory, CUSTOMER_TYPES } from './CustomerFactory.js';
import { Customer, CUSTOMER_STATES as S } from './Customer.js';
import { OrderSystem, ORDER_STATES, patienceLevel } from './OrderSystem.js';
import { BALANCE } from './Balance.js';
import { KITCHEN_LAYOUT } from './KitchenLayout.js';
import { CustomerRoute } from './CustomerRoute.js';
import { RestaurantEntrance } from './RestaurantEntrance.js';

// Chegadas de demonstração; espera controlada individualmente pelos pedidos.
export class CustomerSystem {
  constructor({ scene, delivery, collisionSystem = null, architecture = null, difficulty = null, orderSystem = null, areaWidth = KITCHEN_LAYOUT.width,
    firstArrival = difficulty?.config.firstArrival ?? BALANCE.customers.firstArrival, arrivalInterval = BALANCE.customers.arrivalInterval,
    maxCustomers = difficulty ? Math.max(...difficulty.config[difficulty.mode].map(stage => stage.maxOrders)) : BALANCE.customers.maxCustomers,
    slotOffsets = difficulty ? [-2.25, -.75, .75, 2.25] : [-1.9, 0, 1.9] }) {
    this.scene = scene;
    this.factory = new CustomerFactory();
    this.customers = new Map();
    this.difficulty = difficulty;
    this.orderSystem = orderSystem ?? new OrderSystem({ difficulty });
    if (!Number.isInteger(maxCustomers) || maxCustomers < 1 || maxCustomers > slotOffsets.length
      || !Number.isFinite(firstArrival) || firstArrival < 0 || !Number.isFinite(arrivalInterval) || arrivalInterval <= 0) throw new Error('Configuração de clientes inválida.');
    this.maxCustomers = maxCustomers; this.arrivalInterval = arrivalInterval;
    this.clock = 0; this.nextArrival = firstArrival; this.typeIndex = 0;
    this.lastAttempt = firstArrival; this.phase = difficulty?.index ?? 0;
    this.disposed = false; this.transitId = null;
    this.collisionSystem = collisionSystem;
    this.counterZ = delivery.position.z - delivery.dimensions.depth / 2;
    this.laneZ = this.counterZ - 2.15;
    this.route = new CustomerRoute({ areaWidth, laneZ: this.laneZ, counterZ: this.counterZ });
    this.entry = this.route.outside;
    this.slots = slotOffsets.map((x, index) => ({
      id: `customerSlot${index + 1}`, position: new Vector3(delivery.position.x + x, 0, this.counterZ - 0.65), customerId: null,
    }));
    this.area = new Group(); this.area.name = 'customer-exterior';
    this.areaGeometry = new BoxGeometry(1, 1, 1);
    this.areaGeometries = new Set([this.areaGeometry]);
    this.areaMaterials = ['#e4c49c', '#b88462', '#edc4cb'].map((color) => new MeshStandardMaterial({ color, roughness: 0.9 }));
    const box = (name, position, size, material = 0) => {
      const mesh = new Mesh(this.areaGeometry, this.areaMaterials[material]);
      mesh.name = name; mesh.position.set(...position); mesh.scale.set(...size);
      mesh.castShadow = true; mesh.receiveShadow = true; this.area.add(mesh);
    };
    const module = (name, position, size, material = 0) => {
      const geometry = new BoxGeometry(...size); this.areaGeometries.add(geometry);
      const mesh = new Mesh(geometry, typeof material === 'number' ? this.areaMaterials[material] : material);
      mesh.name = name; mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; this.area.add(mesh);
    };
    // Amplia somente a faixa externa atrás do balcão; equipamentos não se movem.
    this.movedArchitecture = [];
    architecture?.children.forEach((object) => {
      if (/^(back-wall|back-skirting|back-beam|back-post-|shoji-)/.test(object.name)) {
        this.movedArchitecture.push([object, object.position.z]); object.position.z -= 2.7;
      }
    });
    box('customer-floor', [0, -0.1, -8.3], [18, 0.2, 2.7]);
    for (const side of [-1, 1]) {
      box('customer-separator', [side * 5.95, 0.38, this.counterZ], [5.9, 0.76, 0.12], 1);
      const extra = (areaWidth - KITCHEN_LAYOUT.baseWidth) / 2;
      if (extra > 0) {
        module(`customer-floor-extension-${side}`, [side * (KITCHEN_LAYOUT.baseWidth / 2 + extra / 2), -.1, -8.3], [extra, .2, 2.7]);
        module(`customer-separator-extension-${side}`, [side * (8.9 + extra / 2), .38, this.counterZ], [extra, .76, .12], 1);
      }
    }
    // The customer vestibule moves the back wall; bridge that distance with real modules.
    this.wallExtensionIds = [];
    for (const [name, sign] of [['left-wall', -1], ['right-low-wall', 1]]) {
      const wall = architecture?.getObjectByName(name);
      if (!wall) continue;
      const wallBounds = new Box3().setFromObject(wall), size = wallBounds.getSize(new Vector3());
      const id = `customer-wall-extension-${sign}`;
      const start = wallBounds.min.z - 2.7, end = wallBounds.min.z;
      const spans = sign === 1 ? [[start, this.route.door.z - 1], [this.route.door.z + 1, end]] : [[start, end]];
      spans.forEach(([minZ, maxZ], index) => {
        if (maxZ <= minZ) return;
        const segmentId = index === spans.length - 1 ? id : `${id}-${index}`;
        module(segmentId, [wall.position.x, wall.position.y, (minZ + maxZ) / 2], [size.x, size.y, maxZ - minZ + .002], wall.material);
        collisionSystem?.registerObstacle({ id: segmentId, position: { x: wall.position.x, z: (minZ + maxZ) / 2 }, width: size.x, depth: maxZ - minZ + .002 });
        this.wallExtensionIds.push(segmentId);
      });
    }
    for (const name of ['left-beam', 'right-wall-cap', 'left-skirting', 'right-skirting']) {
      if (name.startsWith('right-')) continue; // No trim across the actual doorway.
      const original = architecture?.getObjectByName(name);
      if (!original) continue;
      const originalBounds = new Box3().setFromObject(original), size = originalBounds.getSize(new Vector3());
      module(`customer-${name}-extension`, [original.position.x, original.position.y, originalBounds.min.z - 1.35],
        [size.x, size.y, 2.7], original.material);
    }
    module('customer-floor-back-edge', [0, -.1, -9.75], [KITCHEN_LAYOUT.baseWidth, .2, .2]);
    const sideExtra = (areaWidth - KITCHEN_LAYOUT.baseWidth) / 2;
    if (sideExtra > 0) for (const sign of [-1, 1]) {
      module(`customer-floor-back-edge-${sign}`, [sign * (KITCHEN_LAYOUT.baseWidth / 2 + sideExtra / 2), -.1, -9.75], [sideExtra, .2, .2]);
    }
    this.scene.add(this.area);
    // Separa fisicamente a faixa externa da jogadora, inclusive durante dash.
    collisionSystem?.registerObstacle({ id: 'customer-area-boundary', position: { x: 0, z: this.counterZ }, width: areaWidth, depth: 0.12 });
    this.bounds = new Box3().setFromObject(this.area);
    if (architecture) this.bounds.union(new Box3().setFromObject(architecture));
    // Entry and garden must never change the existing camera fit.
    this.entrance = new RestaurantEntrance(this.route);
    this.scene.add(this.entrance.group);
  }

  spawn() {
    const limit = Math.min(this.maxCustomers, this.difficulty?.maxOrders ?? this.maxCustomers);
    if (this.disposed || this.customers.size >= limit || this.transitId !== null) return null;
    const slot = this.slots.find((candidate) => candidate.customerId === null);
    if (!slot) return null;
    const type = CUSTOMER_TYPES[this.typeIndex++ % CUSTOMER_TYPES.length];
    const customer = new Customer({ type, factory: this.factory, slot, entry: this.entry });
    customer.profile = this.difficulty?.pickProfile() ?? 'common';
    slot.customerId = customer.id; // Reserva antes de começar a caminhar.
    this.customers.set(customer.id, customer); this.scene.add(customer.model);
    this.transitId = customer.id;
    // Budget for the full routed distance, plus door opening and turning in place.
    // The transit reservation is acquired before spawning, so no visible guest queues here.
    customer.follow(this.route.toCounter(slot), S.WALKING_TO_COUNTER, {
      movementDuration: Math.min(BALANCE.customers.arrivalTarget, BALANCE.customers.arrivalLimit) - BALANCE.customers.arrivalTurnAllowance,
    });
    return customer;
  }

  update(deltaTime) {
    if (this.disposed || !Number.isFinite(deltaTime) || deltaTime <= 0) return;
    // Passos limitados mantêm trajetórias estáveis mesmo em testes acelerados.
    let remaining = deltaTime;
    while (remaining > 0.000001) {
      const dt = Math.min(remaining, 0.05); remaining -= dt;
      this.clock += dt;
      const interval = this.difficulty?.arrivalInterval ?? this.arrivalInterval;
      if (this.difficulty && this.phase !== this.difficulty.index) {
        this.phase = this.difficulty.index;
        this.nextArrival = Math.min(this.nextArrival, Math.max(this.clock, this.lastAttempt + interval));
      }
      this.orderSystem.update(dt);
      this.entrance.update(dt, this.customers.values());
      for (const customer of this.customers.values()) {
        const order = this.orderSystem.getOrderForCustomer(customer.id);
        if (order) {
          customer.patienceRatio = order.remainingTime / order.maxPatience;
          customer.patienceLevel = patienceLevel(customer.patienceRatio);
          if (order.state === ORDER_STATES.EXPIRED && customer.serviceResult !== 'EXPIRED') {
            customer.serviceResult = 'EXPIRED'; customer.sadRemaining = .65;
          }
        }
        if (customer.state === S.WAITING && (((order?.state === ORDER_STATES.EXPIRED || order?.state === ORDER_STATES.REJECTED) && !customer.sadRemaining)
          || (order?.state === ORDER_STATES.COMPLETED && !customer.happyRemaining)) && this.transitId === null) {
          this.transitId = customer.id;
          customer.follow(this.route.toOutside(customer.slot), S.LEAVING);
        }
        customer.update(dt, this.entrance.canPass(customer));
        // Release a seat once its previous guest has cleared the approach lane.
        if (customer.state === S.LEAVING && customer.waypoint >= 1 && customer.slot.customerId === customer.id) customer.slot.customerId = null;
        if (customer.arrivalComplete && !customer.orderId) this.orderSystem.createForCustomer(customer);
        if (customer.state === S.WAITING && this.transitId === customer.id) this.transitId = null;
        if (customer.state === S.LEAVING && !customer.moving) {
          if (customer.slot.customerId === customer.id) customer.slot.customerId = null;
          this.orderSystem.removeForCustomer(customer.id);
          customer.dispose(); this.customers.delete(customer.id); this.transitId = null;
        }
      }
      if (this.clock + 1e-8 >= this.nextArrival) {
        this.lastAttempt = this.clock;
        this.nextArrival = this.clock + interval;
        this.spawn();
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.customers.forEach((customer) => customer.dispose()); this.customers.clear();
    this.orderSystem.dispose();
    this.entrance.dispose();
    this.slots.forEach((slot) => { slot.customerId = null; }); this.transitId = null;
    this.collisionSystem?.removeObstacle('customer-area-boundary');
    this.wallExtensionIds.forEach(id => this.collisionSystem?.removeObstacle(id));
    this.movedArchitecture.forEach(([object, z]) => { object.position.z = z; });
    this.area.removeFromParent(); this.areaGeometries.forEach(geometry => geometry.dispose()); this.areaGeometries.clear();
    this.areaMaterials.forEach((material) => material.dispose()); this.factory.dispose();
  }
}

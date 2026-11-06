import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { CustomerFactory, CUSTOMER_TYPES } from './CustomerFactory.js';
import { Customer, CUSTOMER_STATES as S } from './Customer.js';
import { OrderSystem, ORDER_STATES, patienceLevel } from './OrderSystem.js';
import { BALANCE } from './Balance.js';

// Chegadas de demonstração; espera controlada individualmente pelos pedidos.
export class CustomerSystem {
  constructor({ scene, delivery, collisionSystem = null, architecture = null, orderSystem = new OrderSystem(),
    firstArrival = BALANCE.customers.firstArrival, arrivalInterval = BALANCE.customers.arrivalInterval,
    maxCustomers = BALANCE.customers.maxCustomers, slotOffsets = [-1.9, 0, 1.9] }) {
    this.scene = scene;
    this.factory = new CustomerFactory();
    this.customers = new Map();
    this.orderSystem = orderSystem;
    if (!Number.isInteger(maxCustomers) || maxCustomers < 1 || maxCustomers > slotOffsets.length
      || !Number.isFinite(firstArrival) || firstArrival < 0 || !Number.isFinite(arrivalInterval) || arrivalInterval <= 0) throw new Error('Configuração de clientes inválida.');
    this.maxCustomers = maxCustomers; this.arrivalInterval = arrivalInterval;
    this.clock = 0; this.nextArrival = firstArrival; this.typeIndex = 0;
    this.disposed = false; this.transitId = null;
    this.collisionSystem = collisionSystem;
    this.counterZ = delivery.position.z - delivery.dimensions.depth / 2;
    this.laneZ = this.counterZ - 2.15;
    this.entry = new Vector3(4.7, 0, this.laneZ);
    this.slots = slotOffsets.map((x, index) => ({
      id: `customerSlot${index + 1}`, position: new Vector3(delivery.position.x + x, 0, this.counterZ - 0.65), customerId: null,
    }));
    this.area = new Group(); this.area.name = 'customer-exterior';
    this.areaGeometry = new BoxGeometry(1, 1, 1);
    this.areaMaterials = ['#e4c49c', '#b88462', '#edc4cb'].map((color) => new MeshStandardMaterial({ color, roughness: 0.9 }));
    const box = (name, position, size, material = 0) => {
      const mesh = new Mesh(this.areaGeometry, this.areaMaterials[material]);
      mesh.name = name; mesh.position.set(...position); mesh.scale.set(...size);
      mesh.castShadow = true; mesh.receiveShadow = true; this.area.add(mesh);
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
    }
    // Vestíbulo opaco: o cliente nasce e é removido atrás deste painel, fora da vista.
    box('entry-screen', [4.75, 1.25, this.laneZ + 0.58], [1.55, 2.5, 0.14], 2);
    box('entry-side', [5.45, 1.25, this.laneZ], [0.14, 2.5, 1.3], 1);
    box('entry-roof', [4.75, 2.55, this.laneZ], [1.7, 0.16, 1.4], 1);
    this.scene.add(this.area);
    // Separa fisicamente a faixa externa da jogadora, inclusive durante dash.
    collisionSystem?.registerObstacle({ id: 'customer-area-boundary', position: { x: 0, z: this.counterZ }, width: 18, depth: 0.12 });
    this.bounds = new Box3().setFromObject(this.area);
    if (architecture) this.bounds.union(new Box3().setFromObject(architecture));
  }

  spawn() {
    if (this.disposed || this.customers.size >= this.maxCustomers || this.transitId !== null) return null;
    const slot = this.slots.find((candidate) => candidate.customerId === null);
    if (!slot) return null;
    const type = CUSTOMER_TYPES[this.typeIndex++ % CUSTOMER_TYPES.length];
    const customer = new Customer({ type, factory: this.factory, slot, entry: this.entry });
    slot.customerId = customer.id; // Reserva antes de começar a caminhar.
    this.customers.set(customer.id, customer); this.scene.add(customer.model);
    this.transitId = customer.id;
    customer.follow([new Vector3(slot.position.x, 0, this.laneZ), slot.position], S.WALKING_TO_COUNTER);
    return customer;
  }

  update(deltaTime) {
    if (this.disposed || !Number.isFinite(deltaTime) || deltaTime <= 0) return;
    // Passos limitados mantêm trajetórias estáveis mesmo em testes acelerados.
    let remaining = deltaTime;
    while (remaining > 0.000001) {
      const dt = Math.min(remaining, 0.05); remaining -= dt;
      this.clock += dt;
      this.orderSystem.update(dt);
      for (const customer of this.customers.values()) {
        const order = this.orderSystem.getOrderForCustomer(customer.id);
        if (order) {
          customer.patienceRatio = order.remainingTime / order.maxPatience;
          customer.patienceLevel = patienceLevel(customer.patienceRatio);
        }
        if (customer.state === S.WAITING && order?.state === ORDER_STATES.EXPIRED && this.transitId === null) {
          this.transitId = customer.id;
          customer.follow([new Vector3(customer.slot.position.x, 0, this.laneZ), this.entry], S.LEAVING);
        }
        customer.update(dt);
        if (customer.arrivalComplete && !customer.orderId) this.orderSystem.createForCustomer(customer);
        if (customer.state === S.WAITING && this.transitId === customer.id) this.transitId = null;
        if (customer.state === S.LEAVING && !customer.moving) {
          customer.slot.customerId = null;
          this.orderSystem.removeForCustomer(customer.id);
          customer.dispose(); this.customers.delete(customer.id); this.transitId = null;
        }
      }
      if (this.clock + 1e-8 >= this.nextArrival) {
        this.nextArrival += this.arrivalInterval;
        this.spawn();
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.customers.forEach((customer) => customer.dispose()); this.customers.clear();
    this.orderSystem.dispose();
    this.slots.forEach((slot) => { slot.customerId = null; }); this.transitId = null;
    this.collisionSystem?.removeObstacle('customer-area-boundary');
    this.movedArchitecture.forEach(([object, z]) => { object.position.z = z; });
    this.area.removeFromParent(); this.areaGeometry.dispose();
    this.areaMaterials.forEach((material) => material.dispose()); this.factory.dispose();
  }
}

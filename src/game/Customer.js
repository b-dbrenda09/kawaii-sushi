import { MathUtils, Vector3 } from 'three';

export const CUSTOMER_STATES = Object.freeze({ SPAWNING: 'SPAWNING', WALKING_TO_COUNTER: 'WALKING_TO_COUNTER', WAITING: 'WAITING', LEAVING: 'LEAVING', REMOVED: 'REMOVED' });
let nextCustomerId = 1;

export class Customer {
  constructor({ type, factory, slot, entry }) {
    this.id = `customer-${nextCustomerId++}`;
    this.type = type;
    this.rig = factory.create(type);
    this.model = this.rig.model;
    this.model.userData.customerId = this.id;
    this.model.position.copy(entry);
    this.state = CUSTOMER_STATES.SPAWNING;
    this.slot = slot;
    this.waitTime = 0;
    this.elapsed = 0;
    this.animation = 'IDLE';
    this.patienceRatio = 1;
    this.patienceLevel = 'calm';
    this.orderId = null; this.requestedRecipe = null; this.patienceTime = null; this.serviceResult = null;
    this.path = []; this.waypoint = 0; this.speed = 1.35;
    this.offset = new Vector3();
  }

  follow(path, state) {
    this.path = path.map((point) => point.clone()); this.waypoint = 0;
    this.state = state;
  }

  get moving() { return this.waypoint < this.path.length; }
  get arrivalComplete() {
    return this.state === CUSTOMER_STATES.WAITING && !this.moving && Math.abs(this.model.rotation.y) < 0.05;
  }

  update(dt, canMove = true) {
    this.happyRemaining = Math.max(0, (this.happyRemaining ?? 0) - dt);
    this.elapsed += dt;
    let walking = false;
    if (this.moving && canMove) {
      const target = this.path[this.waypoint];
      this.offset.subVectors(target, this.model.position);
      const distance = this.offset.length();
      if (distance > 0.0001) {
        const angle = Math.atan2(this.offset.x, this.offset.z);
        const difference = Math.atan2(Math.sin(angle - this.model.rotation.y), Math.cos(angle - this.model.rotation.y));
        this.model.rotation.y += difference * (1 - Math.exp(-dt * 10));
        // Vira antes de avançar, especialmente no início da saída.
        if (Math.abs(difference) < 0.3) {
          this.model.position.addScaledVector(this.offset, Math.min(this.speed * dt / distance, 1));
          walking = true;
        }
      }
      if (this.model.position.distanceToSquared(target) < 0.000001) this.waypoint++;
    }
    if (!this.moving && this.state === CUSTOMER_STATES.WALKING_TO_COUNTER) {
      this.state = CUSTOMER_STATES.WAITING; this.waitTime = 0;
    }
    if (this.state === CUSTOMER_STATES.WAITING) {
      this.waitTime += dt;
      this.model.rotation.y = MathUtils.damp(this.model.rotation.y, 0, 9, dt);
    }
    this.animation = walking ? 'WALK' : this.state === CUSTOMER_STATES.WAITING ? 'WAIT' : 'IDLE';
    const { body, head, arms, legs, eyes } = this.rig;
    const phase = this.elapsed * 9;
    body.position.y = walking ? Math.abs(Math.sin(phase)) * 0.035 : Math.sin(this.elapsed * 2.4) * 0.012;
    head.rotation.z = Math.sin(this.elapsed * 1.3) * 0.035;
    head.rotation.y = walking ? 0 : Math.sin(this.elapsed * 0.8) * 0.07;
    arms.forEach((arm, i) => { arm.rotation.x = walking ? Math.sin(phase + i * Math.PI) * 0.5 : Math.sin(this.elapsed * 2 + i) * 0.06; });
    legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(phase + Math.PI + i * Math.PI) * 0.48 : 0; });
    const blink = (this.elapsed + Number(this.id.split('-').at(-1)) * 0.73) % 4.3;
    eyes.forEach((eye) => { eye.scale.y = blink < 0.13 ? 0.006 : 0.046; });
    const waiting = this.state === CUSTOMER_STATES.WAITING;
    const concern = waiting && this.patienceLevel !== 'calm';
    const impatient = waiting && this.patienceLevel === 'impatient';
    this.rig.brows.forEach((brow, i) => {
      brow.visible = concern;
      brow.rotation.z = (i === 0 ? 1 : -1) * (impatient ? -0.3 : 0.3);
    });
    this.rig.mouth.scale.y = concern ? 0.024 : 0.013;
    this.rig.mouth.position.y = concern ? -0.145 : -0.135;
    if (this.serviceResult === 'COMPLETED') {
      this.animation = walking ? 'WALK' : 'HAPPY';
      this.rig.brows.forEach(brow => { brow.visible = false; });
      this.rig.mouth.scale.y = 0.025;
      eyes.forEach(eye => { eye.scale.y = 0.018; });
      if (this.happyRemaining > 0) {
        body.position.y = Math.abs(Math.sin(this.elapsed * 10)) * 0.09;
        arms.forEach(arm => { arm.rotation.x = -1.8; });
      }
    }
    if (concern && this.serviceResult !== 'COMPLETED') {
      head.rotation.z += Math.sin(this.elapsed * (impatient ? 4 : 2.2)) * (impatient ? 0.05 : 0.025);
      arms[0].rotation.x += Math.sin(this.elapsed * 3) * 0.13;
      legs[1].rotation.x = Math.max(0, Math.sin(this.elapsed * (impatient ? 8 : 4))) * (impatient ? 0.2 : 0.09);
    }
  }

  dispose() {
    this.model.removeFromParent();
    this.path.length = 0;
    this.state = CUSTOMER_STATES.REMOVED;
  }
}

import { Vector3 } from 'three';

// One reserved transit corridor; players keep their own GPS and kitchen bounds.
export class CustomerRoute {
  constructor({ areaWidth, laneZ, counterZ }) {
    this.door = new Vector3(areaWidth / 2 + .11, 0, -8.3);
    this.outside = new Vector3(areaWidth / 2 + 1.3, 0, counterZ - .85);
    this.approach = new Vector3(this.outside.x, 0, this.door.z);
    this.inside = new Vector3(areaWidth / 2 - 1.3, 0, this.door.z);
    this.lane = new Vector3(this.inside.x, 0, laneZ);
    this.laneZ = laneZ;
  }

  toCounter(slot) {
    return [this.approach, this.door, this.inside, this.lane,
      new Vector3(slot.position.x, 0, this.laneZ), slot.position];
  }

  toOutside(slot) {
    return [new Vector3(slot.position.x, 0, this.laneZ), this.lane,
      this.inside, this.door, this.approach, this.outside];
  }
}

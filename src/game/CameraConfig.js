export const CAMERA_CONFIG = Object.freeze({
  inclination: 55,
  minInclination: 45,
  maxInclination: 60,
  frontDistance: 24,
  minFrontDistance: 12,
  maxFrontDistance: 60,
  // null derives height from frontDistance and inclination; a number sets the initial height.
  height: null,
  zoom: 1.15,
  minZoom: .85,
  maxZoom: 1.15,
  targetHeightRatio: .85,
  targetWidthRatio: .94,
  edgeMargin: .02,
  lookAtOffset: Object.freeze({ x: 0, y: 0, z: 0 }),
});

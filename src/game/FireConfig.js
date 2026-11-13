export const FIRE_CONFIG = Object.freeze({
  ignitionDelay: 5,
  spreadInterval: 4, // Travel time of the announced propagation trail.
  spreadDistance: 6.8,
  smallExtinguishDuration: .8,
  mediumExtinguishDuration: 1.3,
  extinguishDuration: 2,
  mediumAge: 5,
  largeAge: 12,
  progressGrace: 1.5,
  progressDecay: .2, // Seconds of work lost per second, after the grace period.
});

export const CUSTOMER_PROFILES = Object.freeze({
  calm: Object.freeze({ label: 'Tranquilo', patienceMultiplier: 1.2, quickBonus: 0, quickThreshold: .55 }),
  common: Object.freeze({ label: 'Comum', patienceMultiplier: 1, quickBonus: 0, quickThreshold: .55 }),
  hurried: Object.freeze({ label: 'Apressado', patienceMultiplier: .85, quickBonus: 30, quickThreshold: .55 }),
});

export const ORDER_TYPES = Object.freeze({
  normal: Object.freeze({ label: 'Normal', patienceMultiplier: 1, completionBonus: 0, speedBonus: 0 }),
  urgent: Object.freeze({ label: 'Urgente', patienceMultiplier: .8, completionBonus: 35, speedBonus: 0 }),
  speed: Object.freeze({ label: 'Bônus de rapidez', patienceMultiplier: 1, completionBonus: 0, speedBonus: 40 }),
});

const stage = (from, maxOrders, arrivalInterval, profiles, orders) => Object.freeze({
  from, maxOrders, arrivalInterval, profiles: Object.freeze(profiles), orders: Object.freeze(orders),
});
export const SERVICE_CONFIG = Object.freeze({
  firstArrival: 10,
  // Even the shortest urgent order leaves ample time for travel and the existing 6s rice cook.
  minimumPatience: 70,
  solo: Object.freeze([
    stage(0, 2, 22, { calm: .55, common: .4, hurried: .05 }, { normal: .9, urgent: .04, speed: .06 }),
    stage(60, 3, 18, { calm: .35, common: .5, hurried: .15 }, { normal: .7, urgent: .15, speed: .15 }),
    stage(120, 4, 15, { calm: .2, common: .5, hurried: .3 }, { normal: .5, urgent: .25, speed: .25 }),
  ]),
  coop: Object.freeze([
    stage(0, 2, 20, { calm: .5, common: .4, hurried: .1 }, { normal: .85, urgent: .07, speed: .08 }),
    stage(60, 3, 15, { calm: .25, common: .5, hurried: .25 }, { normal: .65, urgent: .18, speed: .17 }),
    stage(120, 4, 12, { calm: .1, common: .5, hurried: .4 }, { normal: .45, urgent: .3, speed: .25 }),
  ]),
});

export function weightedChoice(weights, random = Math.random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let sample = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
  for (const [key, weight] of entries) { sample -= weight; if (sample < 0) return key; }
  return entries.at(-1)[0];
}

// Pure preview: UI and score use exactly the same bonus calculation.
export function orderBonuses(order) {
  if (order.state === 'EXPIRED' || order.remainingTime <= 0) return { urgent: 0, speed: 0, personality: 0, total: 0 };
  const ratio = Math.max(0, Math.min(1, order.remainingTime / order.maxPatience));
  const reward = order.rewards ?? {};
  const urgent = reward.completionBonus ?? 0;
  const speed = Math.round((reward.speedBonus ?? 0) * ratio);
  const threshold = reward.quickThreshold ?? .55;
  const personality = Math.round((reward.quickBonus ?? 0) * Math.max(0, (ratio - threshold) / (1 - threshold)));
  return { urgent, speed, personality, total: urgent + speed + personality };
}

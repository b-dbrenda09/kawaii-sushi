// Valores de jogo centralizados; velocidades absolutas preservam a base anterior.
export const BALANCE = Object.freeze({
  interaction: Object.freeze({ maxDistance: 1.3, reachByType: Object.freeze({ ingredientBox: 1.3, riceCooker: 1.3, cutting: 1.3, assembly: 1.3, delivery: 1.3, trash: 1.3 }), boxAreaRadius: 0.55 * 1.3, cuttingAreaRadius: 0.75 * 1.3 }),
  score: Object.freeze({ basePoints: Object.freeze({ salmon_nigiri: 100, salmon_maki: 120, cucumber_uramaki: 120 }), maxBonus: 50, expiredPenalty: 30, incorrectPenalty: 10, deliveryCooldown: 0.6 }),
  player: Object.freeze({ modelScale: .8, characterTurnSpeed: 2.8, walkSpeed: 4.2 * 1.2, dashSpeed: 4.2 * 2.5 * 1.1, dashDuration: 0.18, dashCooldown: 0.65 }),
  customers: Object.freeze({ firstArrival: 10, arrivalInterval: 20, maxCustomers: 2 }),
  patience: Object.freeze({ salmon_nigiri: 100, salmon_maki: 120, cucumber_uramaki: 120 }),
  rice: Object.freeze({ cookDuration: 6, burnDelay: 20 }),
  cutting: Object.freeze({ requiredCuts: 3, strokeDuration: 0.25 }),
  assembly: Object.freeze({ cancelDuration: 1 }),
});

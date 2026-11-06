// Valores de jogo centralizados; velocidades absolutas preservam a base anterior.
export const BALANCE = Object.freeze({
  player: Object.freeze({ walkSpeed: 4.2 * 1.2, dashSpeed: 4.2 * 2.5 * 1.1, dashDuration: 0.18, dashCooldown: 0.65 }),
  customers: Object.freeze({ firstArrival: 10, arrivalInterval: 20, maxCustomers: 2 }),
  patience: Object.freeze({ salmon_nigiri: 100, salmon_maki: 120, cucumber_uramaki: 120 }),
  rice: Object.freeze({ cookDuration: 6, burnDelay: 20 }),
  cutting: Object.freeze({ requiredCuts: 3, strokeDuration: 0.25 }),
  assembly: Object.freeze({ cancelDuration: 1 }),
});

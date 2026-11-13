import assert from 'node:assert/strict';

// Regression fixtures explicitly finish the demo; production displays the result for 1.5 seconds.
export function answerDelivery(delivery, correct = true) {
  const system = delivery.questionSystem, active = system.active;
  assert.ok(active && active.phase === 'QUESTION');
  assert.ok(system.select((active.question.respostaCorreta + (correct ? 0 : 1)) % 4, active.playerId));
  const result = system.confirm(active.playerId); assert.ok(result?.success);
  system.cancel(); return result;
}

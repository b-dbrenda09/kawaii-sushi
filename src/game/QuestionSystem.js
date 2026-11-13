import { QuestionBank, QUESTION_REWARDS } from './QuestionBank.js';

export class QuestionSystem {
  constructor({ bank = new QuestionBank(), session = null, now = () => performance.now() / 1000, elapsed = () => 0, onChange = () => {} } = {}) {
    Object.assign(this, { bank, session, now, elapsed, onChange });
    this.active = null; this.sequence = 0; this.disposed = false;
  }
  get busy() { return Boolean(this.active); }
  open({ playerId, resolve, cancel = () => {}, orderId }) {
    if (this.disposed || this.busy || (this.session && this.session.mode !== 'PLAYING')) return null;
    const question = this.bank.next(this.elapsed()); if (!question) return null;
    this.active = { id: `delivery-question-${++this.sequence}`, playerId, orderId, question,
      selectedIndex: null, phase: 'QUESTION', resolve, cancel };
    this.session?.openQuestion(); this.onChange(this.active);
    return this.active;
  }
  select(index, playerId) {
    const active = this.active;
    if (!active || active.phase !== 'QUESTION' || active.playerId !== playerId || !Number.isInteger(index) || index < 0 || index > 3) return false;
    active.selectedIndex = index; this.onChange(active); return true;
  }
  confirm(playerId) {
    const active = this.active;
    if (!active || active.phase !== 'QUESTION' || active.playerId !== playerId || active.selectedIndex === null
      || (this.session && this.session.mode !== 'QUESTION')) return null;
    // Latch before invoking delivery/score callbacks: repeated Enter/clicks cannot commit again.
    active.phase = 'RESOLVING';
    const correct = active.selectedIndex === active.question.respostaCorreta;
    let outcome;
    try { outcome = active.resolve(correct, active); }
    catch (error) {
      console.error('[Hello Kitty Sushi] Falha ao concluir o desafio da entrega.', error);
      outcome = { success: false, kind: 'question-error', message: 'Não foi possível concluir esta entrega.' };
    }
    finally { active.cancel(); }
    active.result = { correct: outcome?.success ? correct : null, ...outcome };
    active.phase = 'RESULT'; active.canContinue = false;
    active.resultUntil = this.now() + (active.result.correct === true ? QUESTION_REWARDS.correctReadDuration : QUESTION_REWARDS.incorrectReadDuration);
    this.onChange(active); return active.result;
  }
  update() {
    if (this.active?.phase === 'RESULT' && !this.active.canContinue && this.now() >= this.active.resultUntil) {
      this.active.canContinue = true; this.onChange(this.active);
    }
  }
  continue(playerId) {
    this.update();
    if (this.active?.phase !== 'RESULT' || !this.active.canContinue || this.active.playerId !== playerId
      || (this.session && this.session.mode !== 'QUESTION')) return false;
    this.cancel(); return true;
  }
  cancel({ resume = true } = {}) {
    const active = this.active; if (!active) return;
    this.active = null; active.cancel(); this.onChange(null);
    if (resume) this.session?.closeQuestion();
  }
  dispose() { if (!this.disposed) { this.cancel({ resume: false }); this.disposed = true; } }
}

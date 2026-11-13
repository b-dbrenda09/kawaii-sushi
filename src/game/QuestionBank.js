import { NETWORK_QUESTIONS } from './NetworkQuestions.js';

export const QUESTIONS = NETWORK_QUESTIONS;
export const QUESTION_PROGRESSION = Object.freeze([
  Object.freeze({ from: 0, difficulty: 'facil' }),
  Object.freeze({ from: 100, difficulty: 'media' }),
  Object.freeze({ from: 200, difficulty: 'dificil' }),
]);

export class QuestionBank {
  constructor(questions = QUESTIONS, { random = Math.random, progression = QUESTION_PROGRESSION } = {}) {
    const ids = new Set(), prompts = new Set();
    this.questions = questions.map(question => {
      if (!question || typeof question.id !== 'string' || !question.id.trim() || ids.has(question.id)
        || typeof question.tema !== 'string' || !question.tema.trim()
        || typeof question.enunciado !== 'string' || !question.enunciado.trim()
        || !Array.isArray(question.alternativas) || question.alternativas.length !== 4
        || question.alternativas.some(text => typeof text !== 'string' || !text.trim())
        || !Number.isInteger(question.respostaCorreta) || question.respostaCorreta < 0 || question.respostaCorreta > 3
        || !['facil', 'media', 'dificil'].includes(question.dificuldade)
        || typeof question.explicacao !== 'string' || !question.explicacao.trim()
        || prompts.has(question.enunciado.trim().toLocaleLowerCase())
        || new Set(question.alternativas.map(text => text.trim().toLocaleLowerCase())).size !== 4) throw new Error('Pergunta inválida: IDs únicos, enunciado e quatro alternativas são obrigatórios.');
      ids.add(question.id); prompts.add(question.enunciado.trim().toLocaleLowerCase());
      return Object.freeze({ ...question, alternativas: Object.freeze([...question.alternativas]) });
    });
    if (!progression.length || progression.some((stage, index) => !Number.isFinite(stage.from) || stage.from < 0
      || !['facil', 'media', 'dificil'].includes(stage.difficulty) || (index === 0 ? stage.from !== 0 : stage.from <= progression[index - 1].from))) throw new Error('Progressão de perguntas inválida.');
    this.progression = progression.map(stage => ({ ...stage }));
    this.random = random; this.pool = [];
  }
  next(elapsed = 0) {
    if (!this.questions.length) return null;
    if (!this.pool.length) this.pool = [...this.questions];
    const difficulty = this.progression.filter(stage => elapsed >= stage.from).at(-1)?.difficulty ?? this.progression[0].difficulty;
    const preferred = this.pool.filter(question => question.dificuldade === difficulty);
    const eligible = preferred.length ? preferred : this.pool;
    const index = Math.max(0, Math.min(eligible.length - 1, Math.floor(this.random() * eligible.length)));
    return this.pool.splice(this.pool.indexOf(eligible[index]), 1)[0];
  }
}

export const QUESTION_REWARDS = Object.freeze({ correctBonus: 50, incorrectPenalty: 50, correctReadDuration: 3, incorrectReadDuration: 5 });

// Demonstration content only. Replace this list when the educational theme is defined.
export const QUESTIONS = Object.freeze([
  { id: 'demo_001', tema: 'a_definir', enunciado: 'Demonstração: selecione a alternativa que contém a palavra “Teste”.',
    alternativas: ['Alternativa A', 'Teste', 'Alternativa C', 'Alternativa D'], respostaCorreta: 1,
    explicacao: 'Esta pergunta serve apenas para demonstrar a seleção e a confirmação.', dificuldade: 'demonstracao' },
  { id: 'demo_002', tema: 'a_definir', enunciado: 'Demonstração: qual alternativa mostra um ícone de sushi?',
    alternativas: ['🎀', '🌸', '🍣', '⭐'], respostaCorreta: 2, explicacao: 'O ícone 🍣 é a alternativa indicada neste teste.' },
  { id: 'demo_003', tema: 'a_definir', enunciado: 'Demonstração: para testar esta entrega, escolha a alternativa A.',
    alternativas: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D'], respostaCorreta: 0, explicacao: '' },
].map(question => Object.freeze({ ...question, alternativas: Object.freeze(question.alternativas) })));

export class QuestionBank {
  constructor(questions = QUESTIONS, { random = Math.random } = {}) {
    const ids = new Set();
    this.questions = questions.map(question => {
      if (!question || typeof question.id !== 'string' || !question.id.trim() || ids.has(question.id)
        || typeof question.tema !== 'string' || !question.tema.trim()
        || typeof question.enunciado !== 'string' || !question.enunciado.trim()
        || !Array.isArray(question.alternativas) || question.alternativas.length !== 4
        || question.alternativas.some(text => typeof text !== 'string' || !text.trim())
        || !Number.isInteger(question.respostaCorreta) || question.respostaCorreta < 0 || question.respostaCorreta > 3
        || (question.explicacao !== undefined && typeof question.explicacao !== 'string')) throw new Error('Pergunta inválida: IDs únicos, enunciado e quatro alternativas são obrigatórios.');
      ids.add(question.id);
      return Object.freeze({ ...question, alternativas: Object.freeze([...question.alternativas]) });
    });
    this.random = random; this.pool = [];
  }
  next() {
    if (!this.questions.length) return null;
    if (!this.pool.length) this.pool = [...this.questions];
    const index = Math.max(0, Math.min(this.pool.length - 1, Math.floor(this.random() * this.pool.length)));
    return this.pool.splice(index, 1)[0];
  }
}

export const QUESTION_REWARDS = Object.freeze({ correctBonus: 50, incorrectPenalty: 50, resultDuration: 1.5 });

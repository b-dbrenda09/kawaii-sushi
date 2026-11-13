# Desafio da entrega

Entregar um sushi que corresponde a um pedido pendente abre uma única pergunta antes de conceder pontos. O prato permanece com o jogador, reservado junto ao pedido até a confirmação. Repetições de interação, Enter e cliques não criam novas entregas nem duplicam a pontuação.

## Conteúdo futuro

Edite somente a lista `QUESTIONS` em `src/game/QuestionBank.js` para inserir o conteúdo educativo. Por enquanto, existem três demonstrações neutras com `tema: 'a_definir'`.

```js
{
  id: 'pergunta_001',
  tema: 'a_definir',
  enunciado: 'Demonstração: escolha a alternativa B.',
  alternativas: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D'],
  respostaCorreta: 1, // Índice de 0 a 3.
  explicacao: '',    // Opcional.
  dificuldade: 'demonstracao' // Opcional.
}
```

IDs duplicados, alternativas incompletas e índices inválidos são rejeitados. O banco percorre suas perguntas em ordem aleatória sem repetir antes de esgotar o ciclo. Um banco vazio recusa a entrega sem consumir o prato ou pagar pontos. `QuestionSystem` também aceita outra instância de `QuestionBank` por injeção.

## Regras e controles

Acertar conclui o pedido, consome o prato e concede o valor normal calculado pelo `ScoreSystem`, incluindo os bônus já existentes, mais 50 pontos. Errar consome o prato, encerra o pedido como `REJECTED` e desconta apenas 50 pontos, sem o valor normal e sem uma penalidade extra de expiração. A pontuação não possui piso zero.

O estado `QUESTION` é independente do menu de pausa. Cronômetro, paciência, preparos, incêndios e controles de ambos os jogadores ficam suspensos. Na pergunta, P1 usa W/S e E; P2 usa ↑/↓ e P. Enter confirma a seleção da janela ativa, e o mouse também permite selecionar e confirmar. A janela identifica o dono da entrega; controles do outro perfil não alteram a seleção. Sem alternativa selecionada, a confirmação permanece bloqueada.

O resultado aparece por 1,5 segundo e então retoma a partida automaticamente, sem avançar os relógios pelo tempo passado na pergunta. Acerto e erro usam as reações e a saída pela porta já existentes. Reservas são revalidadas no momento da confirmação e liberadas na resolução ou no descarte da sessão.

O bônus pedagógico não duplica a tabela de preços dos sushis. Os valores do desafio ficam em `QUESTION_REWARDS`; o pagamento continua no `ScoreSystem`. A HUD e os resultados usam os mesmos componentes e exibem números negativos normalmente.

## Validação

`npm test` inclui a regressão dos sistemas existentes e `scripts/verify-questions.mjs`. Com Vite ativo, execute `node scripts/verify-questions-browser.mjs URL_DO_SERVIDOR` para testar a interface em solo/dupla, três tamanhos de tela, seleção obrigatória, pausa, consumo/pontuação únicos, resultados negativos, saída dos clientes e reinício.

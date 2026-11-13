# Desafio da entrega

Entregar um sushi que corresponde a um pedido pendente abre uma única pergunta antes de conceder pontos. O prato permanece com o jogador, reservado junto ao pedido até a confirmação. Repetições de interação, Enter e cliques não criam novas entregas nem duplicam a pontuação.

## Conteúdo educativo e progressão

O banco existente exporta 30 questões originais de `src/game/NetworkQuestions.js`, alinhadas ao escopo introdutório de **Conceitos Básicos de Redes (Networking Basics)** da Cisco Networking Academy: 10 fáceis, 10 médias e 10 difíceis. As difíceis exigem aplicação prática e diagnóstico básico. Não há questões de configuração avançada de CCNA. Para editar o conteúdo, altere essa lista. `QuestionBank.js` continua responsável pela validação e seleção.

Cada linha registra quatro alternativas na ordem A–D e a letra correta. O objeto exportado preserva `respostaCorretaLetra` e converte a letra em `respostaCorreta` (índice 0–3), compatível com a interface e a pontuação existentes.

Cobertura para revisão:

| Tema | Questões (sufixo do ID `basicos_redes_`) |
| --- | --- |
| Comunicação em um mundo conectado | 001 |
| Componentes e tipos de redes | 002–004 |
| Redes sem fio e móveis | 005–006 |
| Construção de redes domésticas | 007, 029 |
| Princípios de comunicação | 008 |
| Meios físicos de rede | 009, 030 |
| Camada de acesso à rede | 010 |
| Protocolo IP | 011 |
| IPv4 e segmentação de redes | 012–013, 021 |
| Endereçamento IPv6 | 014, 028 |
| DHCP | 015, 023 |
| Gateway padrão | 016, 022 |
| ARP | 017 |
| Roteamento entre redes | 027 |
| TCP e UDP | 018 |
| Serviços da camada de aplicação | 019–020, 024 |
| Ferramentas de teste de rede | 025–026 |

```js
{
  id: 'pergunta_001',
  tema: 'Redes',
  enunciado: 'Enunciado original da questão.',
  alternativas: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D'],
  respostaCorreta: 1, // Índice de 0 a 3.
  explicacao: 'Explicação educativa obrigatória.',
  dificuldade: 'facil' // facil, media ou dificil.
}
```

IDs duplicados, alternativas incompletas e índices inválidos são rejeitados. O banco percorre suas perguntas em ordem aleatória sem repetir antes de esgotar o ciclo. Um banco vazio recusa a entrega sem consumir o prato ou pagar pontos. `QuestionSystem` também aceita outra instância de `QuestionBank` por injeção.

`QUESTION_PROGRESSION` configura o nível preferido por segundos decorridos de gameplay: fácil desde 0, médio desde 100 e difícil desde 200. As fronteiras são inclusivas para o novo nível. O banco sorteia entre as questões não usadas do nível preferido; se estiverem esgotadas, usa questões não utilizadas de outros níveis. Só inicia outro ciclo após usar todas as 30. Cada nova partida cria um banco novo. A pausa educativa não avança a progressão.

Referências de escopo (as perguntas são originais e não reproduzem avaliações): [curso Conceitos Básicos de Redes](https://www.netacad.com/courses/networking-basics?courseLang=pt-BR) e [catálogo oficial em português](https://www.netacad.com/sites/default/files/course-catalog-pt.pdf). O curso abrange fundamentos, dispositivos, mídias, protocolos, endereçamento e serviços de aplicação. As questões evitam configuração de VLAN/trunk, protocolos de roteamento dinâmico e comandos avançados de IOS.

## Regras e controles

Acertar conclui o pedido, consome o prato e concede o valor normal calculado pelo `ScoreSystem`, incluindo os bônus já existentes, mais 50 pontos. Errar consome o prato, encerra o pedido como `REJECTED` e desconta apenas 50 pontos, sem o valor normal e sem uma penalidade extra de expiração. A pontuação não possui piso zero.

O estado `QUESTION` é independente do menu de pausa. Cronômetro, paciência, preparos, incêndios e controles de ambos os jogadores ficam suspensos. Na pergunta, P1 usa W/S e E; P2 usa ↑/↓ e P. Enter confirma a seleção da janela ativa, e o mouse também permite selecionar e confirmar. A janela identifica o dono da entrega; controles do outro perfil não alteram a seleção. Sem alternativa selecionada, a confirmação permanece bloqueada.

O resultado mantém as alternativas visíveis e desativadas, com a correta em verde e a incorreta escolhida em vermelho. Exibe a explicação e o bônus ou penalidade. O botão Continuar é habilitado após 3 segundos no acerto ou 5 no erro, configuráveis em `QUESTION_REWARDS`. A partida permanece pausada por tempo indeterminado até Continuar (clique, Enter ou tecla de interação do responsável). Acerto e erro usam as reações e a saída pela porta já existentes. Reservas são revalidadas no momento da confirmação e liberadas na resolução ou no descarte da sessão.

O bônus pedagógico não duplica a tabela de preços dos sushis. Os valores do desafio ficam em `QUESTION_REWARDS`; o pagamento continua no `ScoreSystem`. A HUD e os resultados usam os mesmos componentes e exibem números negativos normalmente.

## Validação

`npm test` inclui a regressão dos sistemas existentes e `scripts/verify-questions.mjs`. Com Vite ativo, execute `node scripts/verify-questions-browser.mjs URL_DO_SERVIDOR` para testar a interface em solo/dupla, três tamanhos de tela, seleção obrigatória, pausa, consumo/pontuação únicos, resultados negativos, saída dos clientes e reinício.

A validação automática confere quantidade, distribuição por dificuldade, IDs, enunciados e alternativas únicos, campos obrigatórios, índice único de resposta, progressão, sorteio e ausência de repetição. A correção conceitual exige revisão humana; não pode ser garantida apenas pela validação estrutural.

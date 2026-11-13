# Etapa 16 — Solo e cooperativo local

Execute `npm run dev` nesta pasta e abra o endereço indicado pelo Vite. Escolha **JOGAR SOZINHO** ou **JOGAR EM DUPLA**, consulte os controles e pressione **Jogar**. O relógio de 180 segundos só começa nesse último passo.

| Modo / personagem | Movimento | Interação | Dash | Cancelar montagem |
| --- | --- | --- | --- | --- |
| Solo / Hello Kitty | WASD ou setas | E | Espaço | Segurar R |
| Dupla / P1 Hello Kitty | WASD | E | Espaço | Segurar R |
| Dupla / P2 Dear Daniel | Setas | P | Shift direito | Segurar Ctrl direito |

Esc pausa a partida inteira. O livro de receitas também suspende a simulação. As configurações preservam os três modos de movimentação. Nos resultados, **Jogar novamente** mantém o modo escolhido; **Voltar à seleção de modo** permite trocar de modo. Durante a pausa também é possível voltar ao menu.

## Arquitetura

`Scene.players` contém somente os modelos ativos. `Game.players` associa modelo, entrada, inventário, seleção de estação e indicador individual. As referências antigas do primeiro jogador continuam disponíveis para compatibilidade.

`PlayerControls.js` descreve os perfis de teclado; `Input` traduz esses perfis em direção e ações. Cada jogador tem seu próprio estado de movimento, dash e corte. A colisão resolve círculos entre personagens usando os mesmos subpassos e a projeção tangencial usados no movimento.

Preparação, estações, clientes, pedidos, entregas, pontuação e relógio continuam únicos por partida. As estações recebem o inventário do autor da ação. Ações do mesmo quadro são processadas em ordem P1/P2 e revalidam o estado da estação, impedindo a retirada repetida de itens. Um golpe de corte reserva a bancada apenas até terminar; o outro jogador continua livre.

## Verificação

- `npm test`: regressão existente e integração dos modos, incluindo preparo das três receitas, contribuição dos dois jogadores, entrega pelo P2, pontuação compartilhada, inventários, colisão, dash, pausa e descarte de entradas.
- `npm run build`: compilação de produção.
- `npm run test:modes:browser -- http://127.0.0.1:5174`: com Vite ativo nessa porta, verifica no Chrome a seleção inicial, alternância entre modos, movimento simultâneo, pausa, receitas, resultados, reinício, remoção da partida anterior e console. Ajuste a porta conforme o Vite. O script usa Chrome instalado no caminho padrão do Windows, ou `CHROME_PATH`.

O teste de navegador acelera o encerramento alterando o tempo restante; o teste do relógio da suíte cobre os 180 segundos por passos de simulação.

## Limitações

Cooperativo somente no teclado local. Algumas combinações simultâneas podem ser limitadas pelo hardware do teclado. Multiplayer online não foi implementado. O build emite aviso de bundle acima de 500 kB por incluir o Three.js.

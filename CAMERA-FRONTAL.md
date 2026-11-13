# Câmera frontal elevada

A projeção anterior já era ortográfica. Foi mantida, substituindo a posição diagonal `(24, 24, 24)` por uma posição à frente da cozinha, no eixo +Z, sem deslocamento lateral em relação ao alvo e sem rotação de rolagem.

## Configuração

Todos os parâmetros estão em `src/game/CameraConfig.js`:

| Parâmetro | Padrão | Efeito |
| --- | --- | --- |
| `inclination` | 55° | Inclinação para baixo em relação ao plano horizontal; limitada a 45–60° |
| `frontDistance` | 24 | Distância frontal ao ponto de observação; limitada a 12–60 |
| `height` | `null` | Altura relativa ao alvo calculada pela inclinação: distância × tan(ângulo). No padrão, aproximadamente 34,28 unidades |
| `zoom` | 1,15 | Aumento solicitado de 15% sobre a referência de 100%; limitado automaticamente ao maior tamanho sem cortes |
| `lookAtOffset` | `{x:0,y:0,z:0}` | Deslocamento do ponto de observação em relação ao centro dos limites reais do cenário |
| `targetHeightRatio` | 0,85 | Ocupação de 85% da altura do canvas na referência de zoom 100%, quando a largura permite |
| `targetWidthRatio` | 0,94 | Ocupação de até 94% da largura na referência de zoom 100% |
| `edgeMargin` | 0,02 | Margem mínima de segurança de 2% por borda, inclusive ao aumentar o zoom |

Para configurar a altura diretamente, use um número em `height`; a inclinação resultante é limitada a 45–60°. Alterar a inclinação pelo menu volta ao cálculo automático de altura. A distância frontal não muda o tamanho aparente em projeção ortográfica; o tamanho é controlado pelo enquadramento e pelo zoom.

No menu principal ou durante a pausa, abra **Configurações**. Os controles de inclinação e zoom (85–115%) atualizam a mesma câmera usada pelos dois jogadores e pelo raycasting. **Restaurar câmera** retorna a 55°/115%. Os ajustes permanecem ao reiniciar a partida; recarregar a página usa os padrões do arquivo.

## Enquadramento

`Camera` projeta os oito cantos dos limites reais da arquitetura, cozinha e área de clientes. O enquadramento considera a proporção da janela e mantém a mesma escala nos dois eixos da tela.

O enquadramento usa o canvas inteiro, sem reservar faixas para pedidos. O frustum é simétrico (`left = -right`, `bottom = -top`) e o centro geométrico dos limites reais fica no centro horizontal e vertical da janela. Não se presume que a origem do mundo seja o centro da cozinha. Não há câmera seguindo personagens nem tela dividida.

Na referência de zoom 100%, a escala é calculada pelo maior dos limites: altura projetada / 85% da altura do canvas e largura projetada / 94% da largura do canvas. O novo padrão solicita 115% dessa escala. Ao aumentar o zoom, o enquadramento limita automaticamente o aumento efetivo para preservar a margem mínima de segurança de 2% por borda. Isso permite aproximadamente +12,94% nas janelas limitadas pela altura e +2,13% nas limitadas pela largura. O aumento integral de 15% causaria cortes nessas condições. A projeção é recalculada a partir da base a cada redimensionamento, sem multiplicações acumulativas.

Três ou quatro pedidos usam duas colunas compactas. Em janelas baixas, o painel fica em uma coluna estreita à direita. Nas versões compactas, a lista auxiliar de ingredientes e o perfil saem do cartão; receita, animal, tipo, bônus, prazo e barra permanecem visíveis, e o livro de receitas mantém as instruções. O HUD se adapta ao espaço sem deslocar ou reduzir a área 3D. Estações, tapetes e personagens mantêm seus tamanhos físicos.

## Controles e compatibilidade

`Input` já calcula o movimento relativo à câmera por sua direção no plano XZ. Com a câmera frontal, W/seta para cima avançam visualmente para cima, S para baixo, A para esquerda e D para direita. Os modos mapa, personagem e GPS foram preservados.

`MouseNavigation` já projeta o mouse pela câmera real e testa o chão e os volumes das estações. Não foi necessário alterar cálculo de rotas, aproximação, colisões, dash ou controles. A instância de `OrthographicCamera` é mantida ao ajustar ângulo ou zoom.

Não foram alterados layout, posições de estações, colisores, receitas, pedidos, pontuação, cronômetro, preparo, modelos ou escala dos personagens.

## Arquivos

Criados: `src/game/CameraConfig.js`, `scripts/verify-camera.mjs`, `CAMERA-FRONTAL.md`.

Modificados: `src/game/Camera.js`, `src/game/Game.js`, `src/game/PauseUI.js`, `src/styles/style.css`, `package.json`, `scripts/verify-modes-browser.mjs`, `scripts/service-browser-scenario.mjs`.

As alterações anteriores do workspace foram preservadas.

## Como testar

1. Execute `npm run dev`, escolha solo e inicie a partida. Confira paredes e bancadas alinhadas horizontalmente, chão e superfícies visíveis.
2. Abra Configurações, experimente 45° e 60°, 85% e 115%, depois restaure o padrão. O cenário inteiro deve continuar visível.
3. Nos controles, selecione o modo relativo à câmera e confira WASD/setas. Experimente também mapa, personagem e GPS.
4. No GPS, aponte para o chão e segure W, mude o cursor e depois aponte para uma estação. Confira a rota, parada, indicador E e interação.
5. No cooperativo, mova Kitty e Daniel separadamente, prepare e entregue pelas teclas individuais. A câmera não deve seguir nenhum dos dois.
6. Confira três e quatro pedidos e redimensione a janela. A cozinha deve permanecer no centro do canvas, sem faixa vazia reservada à direita. Os cartões não devem cobrir as estações, cabeças dos personagens ou clientes nas resoluções verificadas.

## Testes

- `npm test` inclui `verify-camera.mjs` e toda a suíte anterior.
- O teste de câmera cobre solo/cooperativo, 45°/55°/60°, zoom 85%/100%/110%/115%, ausência de rotação diagonal, alinhamento horizontal, limites reais, centro projetado da geometria, cenário transladado fora da origem, ocupação de 85%/94% na referência, aumento com o novo padrão, ausência de zoom acumulativo ao redimensionar, escala 0,8 dos jogadores, direção visual das oito teclas e raycasting para aproximação de todas as estações.
- Resoluções geométricas: 1920×1080, 1440×1000, 1280×720, 375×812, 390×844, 812×375 e 768×1024.
- `node scripts/verify-modes-browser.mjs http://127.0.0.1:5174`, com Vite ativo: menu de câmera, GPS real por mouse, dash, E/P, receitas, pausa, reinício e erros de console. Também verifica canvas em tela inteira, centro da geometria, escala dos jogadores, cartões e sobreposição do HUD em 1440×1000, 1280×720, 390×844, 812×375 e 768×1024.
- Capturas: `artifacts/service-solo-<largura>.png` e `artifacts/service-coop-<largura>.png`.
- `npm run build` valida a produção.

O enquadramento prioriza mostrar a cozinha inteira. Em telas pequenas, isso reduz seu tamanho aparente. O build mantém o aviso de bundle acima de 500 kB.

## Resultados executados

Após a correção de centralização, `npm test` passou com 25 scripts e `npm run build` passou. O teste ampliado de navegador passou em solo e cooperativo, incluindo canvas em tela inteira, centro geométrico no centro da janela, menu, GPS, dash, estações, receitas, pausa, reinício e três/quatro cartões nas cinco resoluções, sem erros de console nos cenários executados. As capturas de desktop, celular e paisagem foram inspecionadas visualmente. O build emitiu somente o aviso de tamanho do bundle mencionado acima. O teste de GPS observa o plano persistido e o evento confirmado de dash para não depender de marcadores/cooldowns transitórios entre chamadas ao navegador; a lógica do GPS não foi modificada.

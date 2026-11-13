# Etapa 19 — animações de preparo

## Arquitetura reutilizada

| Responsabilidade | Implementação |
| --- | --- |
| Hello Kitty e Dear Daniel | `src/game/Player.js`: grupos e primitivas, braços e corpo com pivôs próprios por instância; sem AnimationMixer |
| Animações existentes | `Player.update`, `animateCutting`, gestos de transferência, efeitos de dash |
| Estados das estações | `RiceCookerSystem`, `CuttingSystem`, `AssemblySystem`; registrados em `station.behavior` por `PreparationSystem` |
| Ingredientes | `IngredientFactory` e `Ingredient`: estado, identidade, modelo e proprietário |
| Receitas | `RecipeSystem`: sequências e validação; uramaki permite qualquer ordem válida dos três ingredientes |
| Inventário individual | Um `CarrySystem` por jogador e um item por inventário; `attach` e `transferTo` transferem a representação |
| Identificação da interação | `InteractionSystem` recebe o jogador e seu inventário; comportamento recebe `interact(carrySystem)`; `station.interactingPlayer` mantém exclusão |
| Atualização da cena | `Game.updateSimulation` atualiza preparo, jogadores e montagem; pausa retorna antes de avançar os relógios |
| Tapete maior | `Kitchen` define `assembly-bamboo-mat`; seu filho `storage.anchor` recebe prévia e prato; `AssemblySystem.fitVisual` calcula limites locais com rotação e escala |
| Efeitos e áudio | `RiceCookerEffects`, `CuttingEffects`, novo `AssemblyEffects`; `SoundSystem` já toca corte/conclusão pelos eventos válidos |

Receitas, balanceamento, tempos de preparo, controles, colisões, navegação e layout foram preservados.

## Implementação

- Panela: preservados vapor limitado a cinco partículas, progresso real, arroz pronto, brilho e fumaça de queimado. Acrescentada oscilação discreta da tampa exclusivamente durante `COOKING`.
- Corte: cada golpe concluído atualiza a representação parcial de salmão ou pepino, sem antecipar o estado preparado. O último golpe continua sendo o único que transforma o ingrediente em `*_cut`. Braços, faca e bloqueio usam o progresso e o jogador da ação existente.
- Montagem: somente adições aceitas disparam colocação; arroz se distribui sobre a base e os ingredientes anteriores permanecem na prévia.
- Nigiri: modelagem suave do arroz, posicionamento do salmão e pequenos grãos na porção pronta.
- Maki/uramaki: representação temporária de bambu se curva; quatro seções formam o rolo, recebem cortes de apresentação e se organizam no prato. Nori por fora no maki, arroz por fora e pepino no uramaki.
- Conclusão: cinco brilhos reutilizam materiais/geometrias da fábrica; o áudio existente continua vinculado a `finish-sushi`.
- Personagens: gestos delicados dos braços e inclinação discreta na montagem, por jogador, sem deslocar sua raiz ou criar bloqueios novos.
- Cancelamento, nova adição, retirada antecipada e descarte restauram as poses e removem grupos temporários. Nada é criado por frame.

O estado `READY` continua sendo confirmado imediatamente pela receita. As transições visuais não acrescentam tempo obrigatório: retirar durante a animação a encerra e transfere o sushi completo para as mãos. O tapete real não é movido.

## Arquivos desta etapa

Criados: `src/game/AssemblyEffects.js`, `scripts/verify-preparation-animation.mjs`, `ETAPA-19.md`.

Modificados: `src/game/AssemblySystem.js`, `src/game/CuttingSystem.js`, `src/game/IngredientFactory.js`, `src/game/RiceCookerEffects.js`, `src/game/Player.js`, `src/game/SushiFactory.js`, `scripts/verify-modes-browser.mjs`, `package.json`.

As demais alterações que já existiam no workspace foram preservadas.

## Como testar

Execute `npm run dev` e abra o endereço informado pelo Vite.

1. **Panela:** confira a estação vazia sem vapor; coloque arroz cru e inicie com outra interação. Observe barra, vapor e tampa durante o cozimento. Aguarde o estado pronto; em outra tentativa deixe queimar e confira a indicação e a fumaça escura. Os tempos continuam definidos em `Balance.js`.
2. **Corte:** coloque salmão ou pepino na tábua. Faça cada interação válida separadamente; confira braços, faca, incremento do progresso e separações parciais. Após o último golpe, retire o ingrediente preparado.
3. **Nigiri:** arroz cozido → salmão cortado. Observe a porção e a cobertura sobre o tapete maior.
4. **Maki:** nori → arroz cozido → salmão cortado. Observe camadas, enrolamento, corte e organização das peças com nori por fora.
5. **Uramaki:** arroz cozido, nori e pepino cortado, em qualquer ordem aceita pela receita atual. Experimente também começar pelo pepino. Observe o resultado com arroz por fora.
6. **Retirada/transporte:** pegue o prato imediatamente durante a conclusão e novamente após esperar a animação inteira. Caminhe e use dash; deve haver somente um prato nas mãos. Entregue manualmente a um pedido compatível.
7. **Cooperativo:** use E com Hello Kitty e P com Dear Daniel. Corte simultaneamente em bancadas diferentes; alterne quem adiciona ingredientes e quem retira o prato. Confira inventários e braços independentes e a exclusão na bancada ocupada.
8. **Pausa/reinício:** pause no meio de um preparo e confira que o tempo visual não avança. Reinicie e confira ausência de rolos, brilhos ou itens antigos. Em GPS, confira aproximação com W, parada e impossibilidade de se mover durante um golpe de corte.

## Verificação automatizada

- `npm test`: suíte existente mais `verify-preparation-animation.mjs`.
- `node scripts/verify-preparation-animation.mjs`: estados reais da panela, partículas limitadas, cortes parciais, independência cooperativa, três receitas em 20/60/144 FPS, retirada antecipada e limpeza.
- Com Vite ativo: `node scripts/verify-modes-browser.mjs http://127.0.0.1:5174`. Inclui GPS, E/P, dash, solo/dupla, pausa, renderização das três receitas, transporte, limpeza, reinício e captura de erros de console. A montagem é exercitada pelas APIs reais; movimento e coleta também usam eventos de teclado/mouse.
- `npm run build`: compilação de produção.

## Limites

As animações são transformações low-poly, sem simulação física de alimento ou tecido. O corte intermediário indica as divisões concluídas; não simula a geometria exata de cada golpe. O enrolamento é uma apresentação curta da conclusão já validada, sem uma nova etapa jogável. A suíte automatizada verifica estados, poses e renderização; não substitui avaliação estética manual nem medição de FPS no computador do jogador.

## Resultados executados

`npm test`, o teste específico de animações, o teste ampliado de navegador e `npm run build` passaram. O navegador terminou sem erros de console nos cenários executados. O build emitiu aviso de bundle acima de 500 kB. Vite e Chrome precisaram executar fora da sandbox devido a `spawn EPERM`. Uma tentativa de navegador foi interrompida por recarga durante as edições; outra expôs um destino curto demais no teste de dash. O teste passou após usar um destino mais distante, sem alterações no sistema de navegação.

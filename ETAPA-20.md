# Etapa 20 — clientes, pedidos especiais e ritmo de atendimento

## Arquitetura analisada e reutilizada

| Sistema existente | Responsabilidade mantida |
| --- | --- |
| `CustomerFactory` / `Customer` | Modelos, rig independente, caminhada, espera e expressões |
| `CustomerSystem` | Chegadas, reserva de posições externas, trânsito de entrada/saída e remoção |
| `OrderSystem` | Identificador único, receita, criação após chegada, paciência individual e transições PENDING/COMPLETED/EXPIRED |
| `ScoreSystem` | Pontos por receita, bônus proporcional existente e penalidades |
| `DeliverySystem` | Valida prato/inventário, seleciona receita compatível com menor tempo restante e consome um prato |
| `GameTimer` / `SessionState` / `Game` | 180 segundos, pausa, fim, reinício e atualização dos dois jogadores |
| `CarrySystem` | Um inventário por personagem, compartilhando as estações e os pedidos |
| `OrderUI` / `ScoreUI` | Cartões compactos e feedback dos pontos |

Não foram alterados receitas, ingredientes, preparo, controles, GPS, colisões, dash, câmera ou estrutura da cozinha. Não há perguntas educativas nesta etapa.

## Clientes e perfis

Coelhinho e ursinho foram mantidos; gatinho e cachorrinho foram acrescentados. O panda anterior foi preservado como quinto tipo. O gato tem orelhas triangulares, bigodes e roupa verde pastel; o cachorro tem orelhas caídas, focinho e roupa rosa. Geometrias e materiais são compartilhados pela fábrica.

Todos usam movimentos discretos de cabeça, braços e orelhas, piscadas, reação feliz com coração e expressão triste por 0,65 segundo antes da saída por expiração. Não há criação de modelos por frame. As quatro posições de atendimento ficam distribuídas dentro da mesma faixa externa do balcão de seis unidades; equipamentos e corredores não foram deslocados.

| Perfil | Multiplicador de paciência | Extra especial |
| --- | --- | --- |
| Tranquilo | 1,20 | Nenhum |
| Comum | 1,00 | Nenhum |
| Apressado | 0,85 | Até +30 por entrega rápida |

Paciência inicial = paciência existente da receita × perfil × tipo de pedido, com piso de **70 segundos**. Pedidos existentes não têm seu prazo reduzido quando o período muda.

## Pedidos e pontos

- **Normal:** receitas e pontuação existentes.
- **Urgente:** multiplicador de prazo 0,80, etiqueta permanente e cor diferenciada; +35 se entregue antes de expirar.
- **Bônus de rapidez:** prazo normal; até +40, proporcional à fração de paciência restante.

Mantidos os pontos-base 100/120/120, bônus existente de até +50, penalidade de expiração −30 e erro de entrega −10. Para apressados, o extra decai de +30 até zero quando resta 55% do prazo; abaixo desse limite não há extra de personalidade. Bônus especiais podem se somar ao bônus existente.

`orderBonuses` é a função compartilhada pela interface e pela pontuação. O cartão exibe o total de bônus disponível naquele instante, incluindo o bônus de rapidez original. `ScoreSystem` registra os IDs liquidados: um pedido real só pode receber um resultado financeiro, mesmo que uma chamada ou cópia do objeto seja repetida. Pedidos expirados não pontuam.

`DeliverySystem.findMatchingOrder` faz somente a seleção, sem consumir prato ou conceder pontos. O resultado da entrega inclui IDs do pedido, cliente, jogador e receita, além dos pontos. Essa separação permite uma futura atividade educativa na entrega; nenhuma pergunta, modal ou espera nova foi implementada.

## Dificuldade configurável

Os parâmetros estão em `src/game/ServiceConfig.js`. `DifficultySystem` lê o tempo decorrido do `GameTimer`; não tem relógio independente. Reiniciar cria uma instância nova no primeiro período. Os dois modos usam a mesma lógica.

| Tempo decorrido | Cronômetro | Limite | Intervalo solo | Intervalo coop |
| --- | --- | --- | --- | --- |
| 0–60s | 03:00–02:00 | 2 | 22s | 20s |
| 60–120s | 02:00–01:00 | 3 | 18s | 15s |
| 120–180s | 01:00–00:00 | 4 | 15s | 12s |

Primeira chegada após 10s. As chegadas respeitam também posições livres e o trânsito compartilhado de entrada/saída; não há acúmulo de spawns quando o balcão está cheio. Clientes saindo ainda reservam sua posição, portanto o restaurante pode ficar abaixo do limite de pedidos.

| Modo/período | Tranquilo / comum / apressado | Normal / urgente / rapidez |
| --- | --- | --- |
| Solo 1 | 55 / 40 / 5% | 90 / 4 / 6% |
| Solo 2 | 35 / 50 / 15% | 70 / 15 / 15% |
| Solo 3 | 20 / 50 / 30% | 50 / 25 / 25% |
| Coop 1 | 50 / 40 / 10% | 85 / 7 / 8% |
| Coop 2 | 25 / 50 / 25% | 65 / 18 / 17% |
| Coop 3 | 10 / 50 / 40% | 45 / 30 / 25% |

## Interface

Os cartões continuam no canto superior direito, com animal, personalidade, receita, ingredientes, tipo, bônus, tempo e barra individual. Quatro pedidos usam duas colunas; o painel não captura mouse ou teclado e não movimenta a câmera. O estado de pouca paciência é distinto do tipo urgente.

## Como testar

1. Execute `npm run dev` e escolha solo. No primeiro minuto, confira até dois pedidos e o intervalo mais longo. Em 02:00, o limite sobe para três; em 01:00, para quatro. Os tipos são sorteados, portanto uma partida não garante todas as combinações.
2. Prepare as três receitas pelo livro existente e entregue com E. Confira receita compatível, bônus exibido e apenas um prato consumido. Pedidos urgentes dão +35 extra; nos de rapidez, espere um pouco e compare a queda do bônus disponível.
3. Deixe um pedido expirar: deve haver uma penalidade, expressão triste e saída, sem bônus. Repita interações sem um pedido compatível e confira o cooldown e a penalidade já existentes.
4. No cooperativo, use E com Kitty e P com Daniel, dividindo preparo e entrega. Confira inventários independentes, ritmo um pouco maior e ausência de duplicação de pedidos/pontos.
5. Pause durante uma espera: prazo, animação e período devem congelar. Termine a partida e reinicie: 03:00, fase inicial, placar e clientes novos. Confira GPS, livro de receitas, montagem e dash durante uma partida normal.

## Arquivos desta etapa

Criados: `src/game/ServiceConfig.js`, `src/game/DifficultySystem.js`, `scripts/verify-service.mjs`, `scripts/service-browser-scenario.mjs`, `ETAPA-20.md`.

Modificados: `src/game/CustomerFactory.js`, `src/game/Customer.js`, `src/game/CustomerSystem.js`, `src/game/OrderSystem.js`, `src/game/OrderUI.js`, `src/game/ScoreSystem.js`, `src/game/DeliverySystem.js`, `src/game/Game.js`, `src/styles/style.css`, `scripts/verify-customers.mjs`, `scripts/verify-modes-browser.mjs`, `package.json`.

As alterações anteriores do workspace foram preservadas.

## Verificação

- `npm test`: suíte anterior e `verify-service.mjs`, com limites de 2/3/4 pedidos reais ao longo de 180s nos dois modos, espaçamento entre clientes, combinações de perfil/tipo, IDs e liquidação única.
- `node scripts/verify-service.mjs`: inclui dois inventários disputando um pedido urgente, sem duplicação de entrega ou pontos.
- `node scripts/verify-modes-browser.mjs http://127.0.0.1:5174`, com Vite ativo: testes anteriores mais quatro clientes/cartões, tipos especiais, pausa, câmera estável e reinício da dificuldade. Salva imagens em `artifacts/service-<modo>-<largura>.png` para 1440×1000 e 390×844.
- `npm run build`: produção.

## Limites conhecidos

O balanceamento é conservador e configurável, mas ainda requer sessões humanas para medir a dificuldade percebida. Prazos e tipos são sorteados; as probabilidades não garantem uma sequência fixa por partida. A capacidade inclui clientes em trânsito/saída, priorizando circulação e posições sem sobreposição. O bundle do Three.js permanece acima de 500 kB, com aviso do Vite.

## Resultados executados

`npm test` passou com 24 scripts. `node scripts/verify-service.mjs` também passou após acrescentar o cenário de entrega urgente com dois inventários. `npm run build` passou, com o aviso de bundle descrito acima. O teste ampliado de navegador passou nos dois modos, incluindo quatro cartões, reinício, GPS, três receitas e ausência de erros de console. As capturas em 1440×1000 e 390×844 foram inspecionadas visualmente. O Chrome informou que seu perfil temporário ainda estava em uso e o manteve no diretório temporário; isso não afetou as verificações.

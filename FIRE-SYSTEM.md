# Incêndio 2.0 — Hello Kitty Sushi

O arroz mantém os tempos atuais: 6 segundos de cozimento e 20 segundos até queimar. Se permanecer queimado por mais 5 segundos, sua estação pega fogo. Descartar antes desse prazo evita a ignição.

## Propagação anunciada

Existe uma única propagação pendente por vez. O sistema escolhe o vizinho alcançável mais próximo (desempates pelo destino e pela origem), reserva esse destino e mostra uma trilha animada com um indicador laranja sobre a estação ameaçada. A viagem dura **4 segundos**, configuráveis em `FireConfig.js` por `spreadInterval`.

`FirePropagationRoute` reutiliza `KitchenNavigation`, com folga própria para as pequenas chamas. Paredes, outras bancadas, suporte e extintor no chão são obstáculos. Apenas os móveis de origem e destino são excluídos para conectar suas superfícies. Caminhos sem chegada válida são rejeitados.

O destino da trilha é o destino real da próxima ignição. Apagar a origem cancela imediatamente a trilha e o alerta. Mudanças físicas que bloqueiem a rota também cancelam a reserva antes de anunciar uma nova rota. Estações apagadas não reacendem na mesma ocorrência; suporte e lixeira não propagam fogo.

## Extintor e controles

O único extintor rosa começa no suporte central, na frente da cozinha. Seu modelo recebeu escala uniforme **1,5×**, alça, mangueira curva, bico orientável e identificação branca. A escala permanece igual no suporte, nas mãos e no chão, sem alterar personagens ou câmera.

| Ação | P1 | P2 |
| --- | --- | --- |
| Pegar / devolver ao suporte | E | P |
| Apagar, perto de um foco | Segurar E | Segurar P |
| Deixar no chão | Q | O |

O local de colocação é próximo ao personagem, priorizando a frente. Paredes, móveis, limites, espaço do modelo e outros personagens são verificados. Se não houver espaço acessível, o item permanece nas mãos. No chão, ele fica em pé, mantém a posição, ganha um colisor e pode ser recuperado por qualquer jogador, inclusive pelo GPS. A interação no suporte vazio não teletransporta o item de volta.

## Extinção e recuperação

| Tamanho do foco | Idade | Tempo para apagar |
| --- | --- | --- |
| Pequeno | Menos de 5 s | 0,8 s |
| Médio | De 5 a 12 s | 1,3 s |
| Grande | 12 s ou mais | 2 s |

O requisito é fixado no começo de uma tentativa e nunca ultrapassa 2 segundos. O progresso permanece por 1,5 segundo após soltar a tecla e depois diminui gradualmente. O personagem para e orienta o bico durante o jato. Chamas diminuem com o progresso e rapidamente ao terminar; a fumaça desaparece em 0,8 segundo. O som do jato cessa ao soltar, pausar ou terminar.

Os preparos das estações atingidas ficam congelados. Golpes de corte em andamento são cancelados sem contar cortes adicionais; ingredientes e cortes anteriores permanecem. Montagens preservam seus itens. Panelas atingidas por propagação conservam conteúdo e tempo; arroz queimado é descartado ao apagar sua panela.

## Recursos e validação

Geometrias, materiais e partículas são compartilhados/instanciados; há uma trilha e no máximo duas luzes alaranjadas, sem sombras adicionais. As chamas usam deformação orgânica por shader, camadas vermelhas/laranjas/amarelas, brasas, fumaça e brilho suave. A pontuação não recebe penalidades extras. Pausa, livro de receitas e aba oculta suspendem a simulação.

Execute `npm test`, `npm run build` e, com Vite ativo, `node scripts/verify-fire-browser.mjs URL_DO_SERVIDOR` para testar solo/dupla, trilhas, extinção, colocação/recuperação, GPS, recursos e erros no Chrome headless.

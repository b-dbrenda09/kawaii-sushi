# Imagens personalizadas

Adicione seus PNGs originais nesta pasta, sem alterar os nomes abaixo:

| Arquivo | Onde aparece |
| --- | --- |
| `logo-menu.png` | No lugar do título HELLO KITTY SUSHI no menu inicial, mantendo os emojis e o restante do menu. |
| `fundo-perguntas.png` | Caminho antigo reservado na configuração. A logo das perguntas agora usa a pasta própria abaixo. |
| `logo-carregamento.png` | Reservado para a tela de carregamento. O jogo ainda não possui essa tela. |

As imagens são centralizadas, proporcionais e exibidas inteiras, sem recortes.
Para o pop-up educativo, adicione `logo-perguntas.png` em `public/assets/logos-perguntas/`;
consulte o [README dessa pasta](../logos-perguntas/README.md).
Se estiverem ausentes ou inválidas, o visual padrão continua funcionando, sem ícone de imagem quebrada.
Recarregue a página após adicionar arquivos. Em produção, execute `npm run build` novamente.

Os caminhos ficam centralizados em `src/config/CustomAssets.js`.
Para outro nome ou extensão, atualize somente o caminho correspondente nesse arquivo.
Para um novo local de exibição, adicione uma chave à configuração e use
`mountCustomAsset(elemento, chave, { fallback, alt })` na interface desejada.
O elemento `fallback` é opcional e só é ocultado quando a imagem carrega.
Não coloque informações essenciais apenas em imagens decorativas.

Este README mantém a pasta versionada mesmo antes de adicionar as imagens.

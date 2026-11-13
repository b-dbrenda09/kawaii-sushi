# Imagens personalizadas

Adicione seus PNGs originais nesta pasta, sem alterar os nomes abaixo:

| Arquivo | Onde aparece |
| --- | --- |
| `logo-menu.png` | Acima do título do menu inicial, substituindo os emojis decorativos. |
| `fundo-perguntas.png` | No topo da janela de perguntas, acima dos textos e alternativas. |
| `logo-carregamento.png` | Reservado para a tela de carregamento. O jogo ainda não possui essa tela. |

As imagens são centralizadas, proporcionais e exibidas inteiras, sem recortes.
Se estiverem ausentes ou inválidas, o visual padrão continua funcionando, sem ícone de imagem quebrada.
Recarregue a página após adicionar arquivos. Em produção, execute `npm run build` novamente.

Os caminhos ficam centralizados em `src/config/CustomAssets.js`.
Para outro nome ou extensão, atualize somente o caminho correspondente nesse arquivo.
Para um novo local de exibição, adicione uma chave à configuração e use
`mountCustomAsset(elemento, chave, { fallback, alt })` na interface desejada.
O elemento `fallback` é opcional e só é ocultado quando a imagem carrega.
Não coloque informações essenciais apenas em imagens decorativas.

Este README mantém a pasta versionada mesmo antes de adicionar as imagens.

# Teleprompter (uso pessoal)

App web instalável (PWA) para iPhone, feito para uso pessoal. Funciona no Safari e, depois de adicionado à Tela de Início, abre em tela cheia como um app.

## O que ele faz

- **Scripts**: lista de roteiros, criar, editar, excluir em lote, importar `.txt`, exportar e restaurar backup `.json`.
- **Teleprompter**: texto grande em negrito (fonte Jost), linha de leitura com marcador, toque para iniciar/pausar, arraste para reposicionar.
- **Ajustes**: tamanho da fonte, velocidade, contagem regressiva, estimativa de duração (`~mm:ss`).
- **Modo voz**: o texto acompanha a sua fala (reconhecimento de voz em pt-BR). Palavras lidas escurecem, a palavra atual fica sublinhada. Tolera palavras puladas e pequenas variações.
- **Cores**: cor do texto, espelhar (para vidro de teleprompter), negrito, posição da linha de leitura, margem lateral.
- **Câmera**: pré-visualização da câmera frontal (pede 4K/60 fps, usa o melhor que o aparelho der), texto no alto perto da lente, botão de gravar, trocar câmera.
- **Rascunhos de vídeo**: gravações ficam guardadas no aparelho (IndexedDB) com “Salvar / Compartilhar” para as Fotos ou qualquer app.
- Mantém a tela acesa durante a leitura (Wake Lock). Funciona sem internet depois de instalado.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | estrutura das quatro telas (lista, editor, teleprompter, rascunhos) |
| `styles.css` | visual (claro/escuro na lista, preto no teleprompter) |
| `app.js` | toda a lógica: armazenamento, rolagem, voz, câmera, gravação |
| `sw.js` | cache para abrir offline |
| `manifest.webmanifest`, `icons/` | instalação na Tela de Início |
| `serve.js` | servidor local para testar no Mac |

## Testar no Mac

```bash
node "/Users/conradoadolpho/Documents/app teleprompter/serve.js" 8787
```

Abra `http://localhost:8787` no Chrome ou Safari. Câmera, microfone e voz funcionam em `localhost`.

## Colocar no iPhone

Câmera e microfone só funcionam em páginas **HTTPS** (ou `localhost`). Por isso a pasta precisa ser hospedada em um endereço HTTPS. Qualquer hospedagem de arquivos estáticos serve:

1. **GitHub Pages** (grátis; o `gh` já está logado neste Mac): criar um repositório, enviar a pasta e ativar Pages. Endereço fica `https://<usuario>.github.io/<repositorio>/`.
2. Netlify Drop, Cloudflare Pages ou Vercel: arrastar a pasta.

Depois, no iPhone:

1. Abrir o endereço no **Safari**.
2. Compartilhar → **Adicionar à Tela de Início**.
3. Abrir pelo ícone. Na primeira vez, permitir **microfone** (modo voz) e **câmera** (gravação).

## Limitações desta versão web

- **Janela flutuante sobre a Câmera nativa** (o botão “Floating” do app de referência) não existe na web. O iOS só permite isso para apps nativos, via Picture in Picture. Aqui a solução é o **modo câmera** dentro do app, com o texto no alto da tela.
- **Sincronização iCloud** foi substituída por exportar/restaurar backup `.json`.
- O **modo voz** usa o reconhecimento do próprio Safari. No iPhone, exige internet em alguns modelos e pode parar em silêncios longos; o app reinicia automaticamente.
- **Voz + gravação ao mesmo tempo**: no iOS, dois usos do microfone podem conflitar. Se o reconhecimento falhar durante a gravação, o app avisa e passa para rolagem automática.
- Gravações em vídeo ficam só no aparelho. Salve nas Fotos o que quiser guardar.

## Rota nativa (quando quiser a janela flutuante)

Requer instalar o **Xcode** (App Store, ~15 GB). Este Mac tem só as Command Line Tools.

- SwiftUI, iOS 16+.
- Flutuante: `AVPictureInPictureController` com `AVSampleBufferDisplayLayer`, desenhando o texto como quadros de vídeo. Permite ler o roteiro sobre o app Câmera nativo gravando em 4K.
- Voz: `SFSpeechRecognizer` (pt-BR), mesma lógica de alinhamento palavra a palavra do `app.js`.
- Instalar no próprio iPhone: Apple ID gratuito vale 7 dias por instalação; conta de desenvolvedor paga (US$ 99/ano) vale 1 ano ou via TestFlight.

# TP-SQV (teleprompter pessoal)

TP-SQV é um app web instalável (PWA) de teleprompter para iPhone, feito para uso pessoal. Funciona no Safari e, depois de adicionado à Tela de Início, abre em tela cheia como um app.

## O que ele faz

- **Scripts**: lista com busca, deslizar para excluir, menu por roteiro (abrir, editar, renomear, duplicar, excluir), seleção em lote, importar `.txt`, exportar e restaurar backup `.json`.
- **Editor**: botão Colar, Limpar, contagem de palavras e tempo estimado de leitura (160 palavras/min).
- **Teleprompter**: texto grande em negrito (fonte Jost), linha de leitura com marcador, toque para iniciar/pausar, arraste para reposicionar.
- **Ajustes**: tamanho da fonte, velocidade, contagem regressiva, estimativa de duração (`~mm:ss`).
- **Modo voz**: o texto acompanha a sua fala (reconhecimento de voz em pt-BR). Palavras lidas escurecem, a palavra atual fica sublinhada. Tolera palavras puladas e pequenas variações. O ajuste **Antecipação da voz** (0 a 5 palavras, padrão 2) compensa o atraso do reconhecimento: aumente se a marcação ficar atrás da sua fala.
  - **Improvisos são bem-vindos**: palavras fora do roteiro (“não é?”, “olha só”…) não movem o texto; o app espera você voltar ao roteiro e segue de onde parou. Uma palavra isolada só avança se estiver logo à frente; saltos maiores exigem duas palavras seguidas batendo.
  - **Voltar ou pular no texto**: arraste com o dedo (ou use reiniciar/voltar/avançar) e a palavra na linha de leitura vira a posição atual. Sem rolar, o app só pula se seis palavras seguidas não baterem e as três últimas aparecerem em um único lugar do roteiro.
- **Cores**: cor do texto, espelhar (para vidro de teleprompter), negrito, posição da linha de leitura, margem lateral.
- **Câmera**: pré-visualização da câmera frontal (pede 4K/60 fps, usa o melhor que o aparelho der), texto em uma caixa no alto, perto da lente, com alça para ajustar a altura e transparência do fundo regulável (em Cores). Botões do topo em faixa própria; barra de ferramentas junto ao botão de gravar. Durante a gravação os controles somem (um toque na imagem traz de volta por 4 s).
- **Paisagem**: layout adaptado ao iPhone deitado, na leitura e no modo câmera.
- **Rascunhos de vídeo**: gravações ficam guardadas no aparelho (IndexedDB). **Salvar nas Fotos** abre a folha do iOS só com o vídeo, com “Salvar Vídeo” a um toque; **Compartilhar** abre a folha completa. Fora do iPhone, “Salvar” baixa o arquivo.
- **Google Docs**: os documentos da pasta `Teleprompter` do seu Drive aparecem na lista de roteiros (veja abaixo).
- Mantém a tela acesa durante a leitura (Wake Lock). Funciona sem internet depois de instalado.

## Onde ficam os roteiros

Os roteiros ficam gravados no próprio iPhone, no armazenamento do Safari para o endereço do app (`localStorage`). Não vão para iCloud nem para servidor. Dois cuidados:

- Instale o app na Tela de Início: para apps instalados, o iOS não apaga esses dados por falta de uso.
- De tempos em tempos use ⋯ → **Exportar backup (.json)**. Em outro aparelho, **Restaurar backup** traz tudo de volta.

Com a sincronização do Google Docs, o Drive vira a fonte principal dos roteiros, e o app guarda apenas uma cópia local.

## Google Docs → app

Você escreve no Google Docs e o roteiro aparece no app. Funciona assim: um pequeno script no seu Google (Apps Script) lê a pasta **Teleprompter** do seu Drive e entrega o texto ao app. Cada documento da pasta é um roteiro; o nome do documento é o título.

Configuração, uma vez só (uns 5 minutos):

1. Abra <https://script.google.com> logado na sua conta Google e clique em **Novo projeto**. Dê o nome `Teleprompter`.
2. Apague o conteúdo de `Code.gs`, cole o conteúdo de [`google-apps-script/Code.gs`](google-apps-script/Code.gs) e salve.
3. Clique em **Implantar → Nova implantação**. Em tipo, escolha **App da Web**. Em "Executar como", **Eu**. Em "Quem pode acessar", **Qualquer pessoa**. Clique em **Implantar** e autorize quando o Google pedir.
4. Copie o endereço que termina em `/exec`.
5. No app, ⋯ → **Google Docs: configurar**, cole o endereço e toque em **Salvar e sincronizar**.

Depois disso:

- Crie ou mova documentos para a pasta **Teleprompter** no Drive (o script cria a pasta na primeira vez).
- O app sincroniza ao abrir e quando volta ao primeiro plano; ⋯ → **Atualizar do Google Docs** força na hora.
- Roteiros do Docs aparecem com um ícone de documento. Excluir um deles no app só o esconde até o documento mudar no Drive.
- Editar um roteiro do Docs dentro do app vale só no app; a fonte continua sendo o documento.

**Privacidade**: o endereço `/exec` permite ler os textos dessa pasta a quem o tiver. Não o publique. Para criar roteiros de fora (POST), defina `WRITE_TOKEN` no script.

### Integração com o SQV (adiada, a pedido do Conrado em 08/11/2026)

O mesmo script aceita `POST` com JSON `{ "token": "...", "title": "...", "body": "..." }` e cria o documento na pasta, que então aparece no app. É o gancho para uma opção "Sincronizar com app" em outro sistema: ao salvar o roteiro lá, basta enviar esse POST para o endereço `/exec`.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | estrutura das quatro telas (lista, editor, teleprompter, rascunhos) |
| `styles.css` | visual (claro/escuro na lista, preto no teleprompter) |
| `app.js` | toda a lógica: armazenamento, rolagem, voz, câmera, gravação |
| `sw.js` | cache para abrir offline |
| `manifest.webmanifest`, `icons/` | instalação na Tela de Início |
| `serve.js` | servidor local para testar no Mac |
| `google-apps-script/Code.gs` | ponte com o Google Docs (cole no Apps Script) |

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
2. Para usar o **modo voz**, use direto no Safari (salve nos Favoritos). O ícone da Tela de Início serve para rolagem automática, câmera e gravação, mas o iOS bloqueia a voz nesse modo.
3. Na primeira vez, permitir **microfone** (modo voz) e **câmera** (gravação).

## Limitações desta versão web

- **Janela flutuante sobre a Câmera nativa** (o botão “Floating” do app de referência) não existe na web. O iOS só permite isso para apps nativos, via Picture in Picture. Aqui a solução é o **modo câmera** dentro do app, com o texto no alto da tela.
- **Sincronização iCloud** foi substituída por exportar/restaurar backup `.json`.
- **Modo voz só no Safari.** O iOS não disponibiliza o reconhecimento de voz para apps abertos pelo ícone da Tela de Início ([WebKit bug 225298](https://bugs.webkit.org/show_bug.cgi?id=225298), aberto desde 2021 e ainda sem correção em 2025). Pelo ícone, o app avisa e oferece “Abrir no Safari”. No Safari o modo voz funciona normalmente; o resto do app funciona nos dois. O reconhecimento pode exigir internet e para em silêncios longos; o app reinicia automaticamente.
- **Voz + gravação ao mesmo tempo**: no iOS, dois usos do microfone podem conflitar. Se o reconhecimento falhar durante a gravação, o app avisa e passa para rolagem automática.
- Gravações em vídeo ficam só no aparelho. Salve nas Fotos o que quiser guardar.

## Rota nativa (quando quiser a janela flutuante)

Requer instalar o **Xcode** (App Store, ~15 GB). Este Mac tem só as Command Line Tools.

- SwiftUI, iOS 16+.
- Flutuante: `AVPictureInPictureController` com `AVSampleBufferDisplayLayer`, desenhando o texto como quadros de vídeo. Permite ler o roteiro sobre o app Câmera nativo gravando em 4K.
- Voz: `SFSpeechRecognizer` (pt-BR), mesma lógica de alinhamento palavra a palavra do `app.js`.
- Instalar no próprio iPhone: Apple ID gratuito vale 7 dias por instalação; conta de desenvolvedor paga (US$ 99/ano) vale 1 ano ou via TestFlight.

## Publicado

- Repositório: https://github.com/conradoadolpho/app-teleprompter (público)
- App: https://conradoadolpho.github.io/app-teleprompter/
- Para atualizar: editar os arquivos, `git commit` e `git push` na branch `main`. O GitHub Pages publica a raiz em cerca de um minuto. Se o iPhone mostrar a versão antiga, feche o app e abra de novo (o cache atualiza em segundo plano).

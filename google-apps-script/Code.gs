/**
 * Teleprompter — ponte com o Google Docs.
 *
 * Como usar (uma vez):
 * 1. Abra https://script.google.com e crie um projeto "Teleprompter".
 * 2. Apague o conteúdo de Code.gs e cole este arquivo inteiro. Salve.
 * 3. Implantar → Nova implantação → tipo "App da Web":
 *      Executar como: "Eu"      |      Quem pode acessar: "Qualquer pessoa"
 *    Autorize quando o Google pedir (o script lê só a pasta Teleprompter do seu Drive).
 * 4. Copie o endereço que termina em /exec e cole no app em  ⋯ → "Google Docs: configurar".
 *
 * Depois disso: todo Google Docs dentro da pasta "Teleprompter" do seu Drive vira um roteiro no app.
 * O título do documento é o título do roteiro; o texto do documento é o roteiro.
 * Se alterar este código, use Implantar → Gerenciar implantações → editar → Nova versão.
 */

const FOLDER_NAME = 'Teleprompter';
// Opcional: uma senha para quem for CRIAR roteiros por POST (ex.: o SQV). Vazio = sem senha.
const WRITE_TOKEN = '';

function getFolder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// GET ?action=list  → { scripts: [{ id, title, body, updatedAt }] }
function doGet(e) {
  try {
    const folder = getFolder_();
    const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
    const scripts = [];
    while (files.hasNext()) {
      const f = files.next();
      if (f.isTrashed()) continue;
      const doc = DocumentApp.openById(f.getId());
      scripts.push({
        id: f.getId(),
        title: f.getName(),
        body: doc.getBody().getText(),
        updatedAt: f.getLastUpdated().getTime(),
        url: f.getUrl(),
      });
    }
    scripts.sort((a, b) => b.updatedAt - a.updatedAt);
    return json_({ folder: folder.getName(), count: scripts.length, scripts: scripts });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// POST { token?, id?, title, body } → cria (ou atualiza, se id) um documento na pasta.
// É por aqui que outro sistema (por exemplo o SQV, com "Sincronizar com app") manda um roteiro.
function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (WRITE_TOKEN && data.token !== WRITE_TOKEN) return json_({ error: 'token inválido' });
    if (!data.body && !data.id) return json_({ error: 'faltou body' });
    const folder = getFolder_();
    let doc;
    if (data.id) {
      doc = DocumentApp.openById(data.id);
      if (data.body != null) doc.getBody().setText(String(data.body));
      if (data.title) DriveApp.getFileById(data.id).setName(String(data.title));
    } else {
      doc = DocumentApp.create(String(data.title || 'Roteiro ' + new Date().toLocaleString('pt-BR')));
      doc.getBody().setText(String(data.body));
      DriveApp.getFileById(doc.getId()).moveTo(folder);
    }
    doc.saveAndClose();
    return json_({ ok: true, id: doc.getId(), url: doc.getUrl() });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

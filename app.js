'use strict';
/* Teleprompter pessoal — PWA sem dependências.
   Módulos: Store (roteiros), Views, Editor, Prompter (rolagem/voz), Camera (gravação), Drafts (IndexedDB). */

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const body = document.body;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtTime = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB';
const normalizeWord = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const wordCount = t => (t.trim().match(/\S+/g) || []).length;
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
function lev(a, b) { // distância de edição (palavras curtas, custo baixo)
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// ---------- armazenamento ----------
const Store = {
  key: 'tp.scripts',
  load() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  save(list) { try { localStorage.setItem(this.key, JSON.stringify(list)); } catch { toast('Não consegui salvar (armazenamento cheio?)'); } },
};
const defaultSettings = { fontSize: 32, speed: 10, countdown: 3, voice: false, voiceLead: 2, syncUrl: '', camBoxHeight: 34, camBoxOpacity: 78, camBoxWidth: 46, camSide: 'auto', mirror: false, bold: true, color: '#ffffff', linePos: 33, margin: 24, rear: false };
let settings = { ...defaultSettings };
try { settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('tp.settings') || '{}') }; } catch { }
function saveSettings() { try { localStorage.setItem('tp.settings', JSON.stringify(settings)); } catch { } }

let scripts = Store.load();
if (!scripts.length && !localStorage.getItem('tp.seeded')) {
  scripts = [{
    id: uid(), title: 'Como usar o Teleprompter', createdAt: Date.now(), updatedAt: Date.now(),
    body: 'Pessoal, olha só. Este é o seu teleprompter.\n\nToque no texto para começar ou pausar a rolagem. Arraste com o dedo para ajustar a posição.\n\nNos ajustes, você muda o tamanho da fonte, a velocidade e a contagem regressiva.\n\nNo modo voz, o texto acompanha a sua fala: ele avança conforme você lê, e espera quando você para.\n\nNo modo câmera, o texto fica no alto, perto da lente, e você grava direto por aqui. Os vídeos ficam em Rascunhos de vídeo.\n\nBoa gravação!'
  }];
  Store.save(scripts); try { localStorage.setItem('tp.seeded', '1'); } catch { }
}

// ---------- navegação ----------
const views = { list: $('#view-list'), editor: $('#view-editor'), prompter: $('#view-prompter'), drafts: $('#view-drafts') };
let currentView = 'list';
function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
  currentView = name;
  if (name !== 'prompter') Prompter.leave();
}

// ---------- modal genérico (substitui alert/confirm/prompt) ----------
function modal({ title, text, input, placeholder, value, actions }) {
  return new Promise(resolve => {
    const m = $('#modal'), inp = $('#modal-input'), box = $('#modal-actions');
    $('#modal-title').textContent = title || '';
    $('#modal-text').textContent = text || ''; $('#modal-text').classList.toggle('hidden', !text);
    inp.classList.toggle('hidden', !input); inp.placeholder = placeholder || ''; inp.value = value || '';
    box.innerHTML = '';
    const close = v => { m.classList.add('hidden'); resolve(v); };
    for (const a of actions) {
      const b = document.createElement('button'); b.className = 'text-btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '');
      b.textContent = a.label; b.addEventListener('click', () => close(a.value === undefined ? a.label : (input && a.primary ? inp.value : a.value)));
      box.appendChild(b);
    }
    m.onclick = e => { if (e.target === m) close(null); };
    m.classList.remove('hidden');
    if (input) setTimeout(() => { inp.focus(); inp.select(); }, 50);
  });
}
const confirmModal = (title, text, label = 'Excluir') => modal({ title, text, actions: [{ label, danger: true, value: true }, { label: 'Cancelar', value: false }] });

// ---------- lista ----------
const List = {
  selecting: false, selected: new Set(),
  query: '',
  render() {
    const ul = $('#script-list'); ul.innerHTML = '';
    const q = normalizeWord(this.query.replace(/\s+/g, ' ')) ; // busca sem acentos/maiúsculas
    let sorted = [...scripts].sort((a, b) => b.updatedAt - a.updatedAt);
    if (this.query.trim()) sorted = sorted.filter(s => normalizeWord((s.title || '') + ' ' + s.body).includes(q));
    if (!sorted.length) { ul.innerHTML = `<li class="empty">${this.query.trim() ? 'Nenhum roteiro combina com a busca.' : 'Nenhum roteiro ainda. Toque no lápis para criar o primeiro.'}</li>`; return; }
    for (const s of sorted) {
      const li = document.createElement('li'); li.dataset.id = s.id;
      if (this.selected.has(s.id)) li.classList.add('sel');
      li.innerHTML = `<button class="swipe-del" aria-label="Excluir">Excluir</button><div class="row"><span class="cb"></span><span class="t"></span>${s.source === 'gdocs' ? '<svg class="src" aria-label="Google Docs"><use href="#i-doc"/></svg>' : ''}<button class="row-menu" aria-label="Mais ações"><svg><use href="#i-dots"/></svg></button><span class="chev">›</span></div>`;
      li.querySelector('.t').textContent = s.title || fmtDate(s.createdAt);
      li.querySelector('.row-menu').addEventListener('click', e => { e.stopPropagation(); this.rowActions(s); });
      li.querySelector('.swipe-del').addEventListener('click', e => { e.stopPropagation(); this.remove([s.id]); });
      const row = li.querySelector('.row');
      row.addEventListener('click', () => {
        if (li.classList.contains('open')) { li.classList.remove('open'); return; }
        if (this.selecting) { this.selected.has(s.id) ? this.selected.delete(s.id) : this.selected.add(s.id); li.classList.toggle('sel'); return; }
        Prompter.open(s.id);
      });
      this.bindSwipe(li, row);
      ul.appendChild(li);
    }
  },
  bindSwipe(li, row) { // deslizar para a esquerda revela Excluir
    let x0 = 0, y0 = 0, dx = 0, horizontal = null;
    row.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horizontal = null; row.style.transition = 'none'; }, { passive: true });
    row.addEventListener('touchmove', e => {
      const x = e.touches[0].clientX - x0, y = e.touches[0].clientY - y0;
      if (horizontal === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) horizontal = Math.abs(x) > Math.abs(y);
      if (!horizontal) return;
      const base = li.classList.contains('open') ? -96 : 0;
      dx = Math.max(-120, Math.min(0, base + x)); row.style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    row.addEventListener('touchend', () => {
      row.style.transition = ''; row.style.transform = '';
      if (horizontal) { $$('#script-list li.open').forEach(o => o !== li && o.classList.remove('open')); li.classList.toggle('open', dx < -48); }
    });
  },
  async rowActions(s) {
    const r = await modal({ title: s.title || fmtDate(s.createdAt), actions: [
      { label: 'Abrir', value: 'open', primary: true }, { label: 'Editar', value: 'edit' }, { label: 'Renomear', value: 'rename' },
      { label: 'Duplicar', value: 'dup' }, { label: 'Excluir', value: 'del', danger: true }, { label: 'Cancelar', value: null }] });
    if (r === 'open') Prompter.open(s.id);
    else if (r === 'edit') Editor.open(s.id);
    else if (r === 'rename') {
      const t = await modal({ title: 'Renomear roteiro', input: true, placeholder: 'Título', value: s.title, actions: [{ label: 'Salvar', primary: true }, { label: 'Cancelar', value: null }] });
      if (t !== null) { s.title = t.trim(); s.updatedAt = Date.now(); Store.save(scripts); this.render(); }
    } else if (r === 'dup') {
      scripts.push({ id: uid(), title: (s.title || fmtDate(s.createdAt)) + ' (cópia)', body: s.body, createdAt: Date.now(), updatedAt: Date.now() });
      Store.save(scripts); this.render(); toast('Roteiro duplicado');
    } else if (r === 'del') this.remove([s.id]);
  },
  async remove(ids) {
    const n = ids.length;
    if (!await confirmModal(n > 1 ? `Excluir ${n} roteiros?` : 'Excluir este roteiro?', 'Esta ação não pode ser desfeita.')) { $$('#script-list li.open').forEach(o => o.classList.remove('open')); return; }
    Sync.hide(ids);
    scripts = scripts.filter(s => !ids.includes(s.id)); Store.save(scripts);
    if (this.selecting) this.setSelecting(false); else this.render();
  },
  setSelecting(on) {
    this.selecting = on; this.selected.clear(); body.classList.toggle('selecting', on);
    $('#select-bar').classList.toggle('hidden', !on); this.render();
  },
};
$('#btn-select').addEventListener('click', () => List.setSelecting(!List.selecting));
$('#btn-cancel-select').addEventListener('click', () => List.setSelecting(false));
$('#btn-delete-selected').addEventListener('click', () => {
  if (!List.selected.size) { toast('Selecione ao menos um roteiro'); return; }
  List.remove([...List.selected]);
});
$('#search').addEventListener('input', e => { List.query = e.target.value; List.render(); });
$('#btn-new').addEventListener('click', () => Editor.open(null));
const menu = $('#menu-list');
$('#btn-menu').addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.add('hidden'); });
$('#m-drafts').addEventListener('click', () => { menu.classList.add('hidden'); Drafts.open(); });
$('#m-import').addEventListener('click', () => { menu.classList.add('hidden'); $('#file-import').click(); });
$('#m-export').addEventListener('click', () => {
  menu.classList.add('hidden');
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), scripts }, null, 2)], { type: 'application/json' });
  shareOrDownload(blob, `teleprompter-backup-${new Date().toISOString().slice(0, 10)}.json`);
});
$('#m-restore').addEventListener('click', () => { menu.classList.add('hidden'); $('#file-restore').click(); });
$('#file-import').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const text = await f.text();
  const s = { id: uid(), title: f.name.replace(/\.[^.]+$/, ''), body: text.trim(), createdAt: Date.now(), updatedAt: Date.now() };
  scripts.push(s); Store.save(scripts); List.render(); toast('Roteiro importado');
});
$('#file-restore').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text()); const list = Array.isArray(data) ? data : data.scripts;
    if (!Array.isArray(list)) throw new Error('formato');
    let added = 0;
    for (const s of list) { if (s && s.body != null && !scripts.some(x => x.id === s.id)) { scripts.push({ id: s.id || uid(), title: s.title || '', body: String(s.body), createdAt: s.createdAt || Date.now(), updatedAt: s.updatedAt || Date.now() }); added++; } }
    Store.save(scripts); List.render(); toast(`${added} roteiro(s) restaurado(s)`);
  } catch { toast('Arquivo de backup inválido'); }
});

function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function shareOrDownload(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: title || name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  downloadBlob(blob, name); return true;
}
// Na web não existe acesso direto à Fototeca: o iOS só grava vídeo nas Fotos pela folha do sistema.
// Abrimos a folha só com o vídeo; “Salvar Vídeo” fica a um toque. Fora do iOS, baixa o arquivo.
async function saveToPhotos(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    toast('Toque em “Salvar Vídeo” para gravar nas Fotos', 3500);
    try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') downloadBlob(blob, name); }
    return;
  }
  downloadBlob(blob, name); toast('Vídeo baixado');
}

// ---------- editor ----------
const Editor = {
  id: null, returnTo: 'list',
  open(id, returnTo = 'list') {
    this.id = id; this.returnTo = returnTo;
    const s = id ? scripts.find(x => x.id === id) : null;
    $('#ed-title').value = s ? s.title : ''; $('#ed-body').value = s ? s.body : '';
    this.count(); showView('editor');
    setTimeout(() => (s ? $('#ed-body') : $('#ed-title')).focus(), 50);
  },
  count() { const w = wordCount($('#ed-body').value); $('#ed-count').textContent = `${w} palavra${w === 1 ? '' : 's'} • ~${fmtTime(w / 160 * 60)} de leitura`; },
  save() {
    const title = $('#ed-title').value.trim(), bodyText = $('#ed-body').value.replace(/\r\n/g, '\n').trim();
    if (!bodyText) { toast('O roteiro está vazio'); return; }
    let s = this.id ? scripts.find(x => x.id === this.id) : null;
    if (!s) { s = { id: uid(), createdAt: Date.now() }; scripts.push(s); }
    s.title = title; s.body = bodyText; s.updatedAt = Date.now();
    if (s.source === 'gdocs') { s.syncedAt = Date.now(); toast('Editado só no app. Para valer no Google Docs, edite o documento lá.', 3500); }
    Store.save(scripts); List.render();
    if (this.returnTo === 'prompter') Prompter.open(s.id); else showView('list');
  },
  cancel() { if (this.returnTo === 'prompter' && this.id) Prompter.open(this.id); else showView('list'); },
};
$('#ed-body').addEventListener('input', () => Editor.count());
$('#ed-paste').addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (!t) { toast('A área de transferência está vazia'); return; }
    const ta = $('#ed-body'); const a = ta.selectionStart, b = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + t + ta.value.slice(b); ta.selectionStart = ta.selectionEnd = a + t.length; Editor.count();
  } catch { toast('Não consegui ler a área de transferência. Toque e segure no texto e escolha Colar.'); }
});
$('#ed-clear').addEventListener('click', async () => {
  if (!$('#ed-body').value.trim() || await confirmModal('Limpar o texto?', 'O título é mantido.', 'Limpar')) { $('#ed-body').value = ''; Editor.count(); $('#ed-body').focus(); }
});
$('#ed-save').addEventListener('click', () => Editor.save());
$('#ed-cancel').addEventListener('click', () => Editor.cancel());

// ---------- teleprompter ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// App aberto pelo ícone da Tela de Início: o iOS não disponibiliza o reconhecimento de voz nesse modo (WebKit bug 225298)
const isStandalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
const voiceErrorText = {
  'not-allowed': 'Microfone negado. Em Ajustes › Safari › Microfone, permita para este site.',
  'service-not-allowed': 'O sistema não liberou o serviço de reconhecimento de voz.',
  'audio-capture': 'Microfone indisponível (outro app ou a gravação pode estar usando).',
  'network': 'Sem conexão: o reconhecimento de voz do iPhone precisa de internet.',
  'language-not-supported': 'Idioma pt-BR não disponível no reconhecimento.',
};
const Prompter = {
  script: null, tokens: [], spans: [], pos: 0, lastHi: 0,
  playing: false, scrollY: 0, target: null, raf: 0, lastTs: 0,
  voiceOn: false, rec: null, consumed: new Map(), voiceErrors: 0, restartTimer: 0, watchdog: 0, recStarted: false,
  recent: [], misses: 0, pending: -1, lastProgScroll: 0, scrollSyncTimer: 0,
  wakeLock: null, countdownTimer: 0,
  el: { scroller: $('#scroller'), content: $('#content'), prompter: $('#prompter'), line: $('#reading-line') },

  open(id) {
    this.script = scripts.find(x => x.id === id); if (!this.script) return;
    showView('prompter');
    this.applySettings(); this.renderText();
    this.scrollY = 0; this.el.scroller.scrollTop = 0; this.pos = 0; this.lastHi = 0; this.target = null;
    this.setPlaying(false);
    if (settings.voice) this.setVoice(true, true);
    this.requestWakeLock();
    cancelAnimationFrame(this.raf); this.lastTs = 0; this.raf = requestAnimationFrame(ts => this.loop(ts));
    this.updateEta();
  },
  leave() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.setPlaying(false); this.stopVoice(); Camera.stop(); this.releaseWakeLock();
    clearTimeout(this.countdownTimer); $('#countdown').classList.add('hidden');
    closeSheets();
  },
  applySettings() {
    const r = document.documentElement.style;
    r.setProperty('--font-size', settings.fontSize + 'px');
    r.setProperty('--margin', settings.margin + 'px');
    r.setProperty('--text-color', settings.color);
    r.setProperty('--line-pos', settings.linePos + '%');
    r.setProperty('--cam-box-h', settings.camBoxHeight + '%');
    r.setProperty('--cam-box-op', (settings.camBoxOpacity / 100).toFixed(2));
    r.setProperty('--cam-box-w', settings.camBoxWidth + '%');
    applyCamSide();
    $('#p-opacity').value = settings.camBoxOpacity; $('#p-opacity-v').textContent = settings.camBoxOpacity + '%';
    body.classList.toggle('mirror', settings.mirror);
    body.classList.toggle('light-text', !settings.bold);
    body.classList.toggle('cam-rear', settings.rear);
    $('#s-font').value = settings.fontSize; $('#s-font-v').textContent = settings.fontSize;
    $('#s-speed').value = settings.speed; $('#s-speed-v').textContent = settings.speed;
    $('#s-count').value = settings.countdown; $('#s-count-v').textContent = settings.countdown;
    $('#s-voice').checked = settings.voice;
    $('#s-lead').value = settings.voiceLead; $('#s-lead-v').textContent = settings.voiceLead;
    $('#p-mirror').checked = settings.mirror; $('#p-bold').checked = settings.bold;
    $('#p-line').value = settings.linePos; $('#p-line-v').textContent = settings.linePos + '%';
    $('#p-margin').value = settings.margin; $('#p-margin-v').textContent = settings.margin;
    $$('#swatches button').forEach(b => b.classList.toggle('sel', b.dataset.c === settings.color));
    this.layoutLine();
  },
  // Deitado no modo câmera, a caixa fica ao lado da câmera: a linha de leitura vai para a altura da lente
  // (a câmera frontal fica no meio da borda lateral, ou seja, no meio da altura da tela).
  effectiveLinePos() {
    if (body.classList.contains('cam-on') && (body.classList.contains('cam-left') || body.classList.contains('cam-right'))) {
      const r = this.el.prompter.getBoundingClientRect();
      if (r.height > 0) return Math.max(12, Math.min(70, (window.innerHeight / 2 - r.top) / r.height * 100));
    }
    return settings.linePos;
  },
  layoutLine() { // o texto começa exatamente na linha de leitura
    const h = this.el.prompter.clientHeight, lp = this.effectiveLinePos();
    this.el.prompter.style.setProperty('--line-pos', lp.toFixed(2) + '%');
    const pad = Math.round(h * lp / 100);
    this.el.content.style.setProperty('--line-pad', pad + 'px');
    this.el.content.style.paddingBottom = Math.max(200, h - pad) + 'px';
  },
  lineOffset() { return Math.round(this.el.prompter.clientHeight * this.effectiveLinePos() / 100); },
  renderText() {
    const c = this.el.content; c.innerHTML = ''; this.tokens = []; this.spans = [];
    const paragraphs = this.script.body.split(/\n+/);
    for (const para of paragraphs) {
      if (!para.trim()) continue;
      const p = document.createElement('p');
      const words = para.trim().split(/\s+/);
      words.forEach((w, i) => {
        const span = document.createElement('span'); span.className = 'w'; span.textContent = w;
        p.appendChild(span); if (i < words.length - 1) p.appendChild(document.createTextNode(' '));
        this.spans.push(span); this.tokens.push(normalizeWord(w));
      });
      c.appendChild(p);
    }
    this.layoutLine();
  },
  pxPerSec() { return settings.speed * 2.6 * (settings.fontSize / 32); },
  maxScroll() { return Math.max(0, this.el.scroller.scrollHeight - this.el.scroller.clientHeight); },
  updateEta() {
    const eta = $('#s-eta');
    if (this.voiceOn) { eta.textContent = '--:--'; return; }
    const remaining = Math.max(0, this.maxScroll() - this.scrollY - (this.el.prompter.clientHeight - this.lineOffset()) + 100);
    eta.textContent = '~' + fmtTime(remaining / this.pxPerSec());
  },

  // laço de animação
  loop(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(0.1, (ts - this.lastTs) / 1000); this.lastTs = ts;
    const sc = this.el.scroller;
    if (this.manualTouch) { this.scrollY = sc.scrollTop; }
    else if (this.voiceOn) {
      if (this.target != null) {
        const d = this.target - this.scrollY;
        if (Math.abs(d) < 0.6) { this.scrollY = this.target; this.target = null; }
        else this.scrollY += d * Math.min(1, dt * 5);
        sc.scrollTop = this.scrollY; this.lastProgScroll = ts;
      }
    } else if (this.playing) {
      this.scrollY = Math.min(this.maxScroll(), this.scrollY + this.pxPerSec() * dt);
      sc.scrollTop = this.scrollY; this.lastProgScroll = ts;
      if (this.scrollY >= this.maxScroll() - 0.5) this.setPlaying(false);
    }
    this.raf = requestAnimationFrame(t => this.loop(t));
  },
  setPlaying(on) {
    this.playing = on;
    const icon = on ? '#i-pause' : '#i-play';
    $('#t-play use').setAttribute('href', icon); $('#c-play use').setAttribute('href', icon);
    $('#t-play').classList.toggle('playing', on);
  },
  togglePlay() {
    if (this.voiceOn) { this.setVoice(false); toast('Modo voz desligado. Rolagem automática.'); }
    if (this.playing) { this.setPlaying(false); return; }
    if (this.scrollY >= this.maxScroll() - 1) { this.scrollY = 0; this.el.scroller.scrollTop = 0; }
    this.startWithCountdown(() => this.setPlaying(true));
  },
  startWithCountdown(then) {
    const n = settings.countdown | 0; if (!n) { then(); return; }
    const box = $('#countdown'), span = box.querySelector('span'); let k = n;
    box.classList.remove('hidden'); span.textContent = k;
    clearTimeout(this.countdownTimer);
    const tick = () => { k--; if (k <= 0) { box.classList.add('hidden'); then(); return; } span.textContent = k; this.countdownTimer = setTimeout(tick, 1000); };
    this.countdownTimer = setTimeout(tick, 1000);
  },
  restart() { this.setPlaying(false); this.scrollY = 0; this.el.scroller.scrollTop = 0; this.lastProgScroll = performance.now(); this.pos = 0; this.target = null; this.recent = []; this.misses = 0; this.pending = -1; this.highlight(); this.updateEta(); },
  nudge(dir) {
    const step = this.el.prompter.clientHeight * 0.3 * dir;
    this.scrollY = Math.max(0, Math.min(this.maxScroll(), this.scrollY + step)); this.el.scroller.scrollTop = this.scrollY; this.lastProgScroll = performance.now();
    if (this.voiceOn) this.syncPosToScroll(); this.updateEta();
  },

  // ---- modo voz ----
  setVoice(on, silent = false) {
    if (on && !SR) { toast('Reconhecimento de voz não está disponível neste navegador. No iPhone, use o Safari.'); $('#s-voice').checked = false; settings.voice = false; saveSettings(); return; }
    settings.voice = on; saveSettings();
    $('#s-voice').checked = on; $('#t-voice').classList.toggle('active', on); body.classList.toggle('voice-on', on);
    if (on) { this.setPlaying(false); this.syncPosToScroll(); this.startVoice(); if (!silent) toast(isIOS && isStandalone ? 'Tentando ativar a voz…' : 'Modo voz ativado: o texto acompanha a sua fala'); }
    else { this.stopVoice(); this.highlight(true); }
    this.voiceOn = on; this.updateEta();
  },
  startVoice() {
    this.stopVoice(); this.voiceErrors = 0;
    const rec = new SR(); this.rec = rec;
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    this.consumed = new Map();
    this.recStarted = false; clearTimeout(this.watchdog);
    // se o serviço não responder em alguns segundos, avisa (na Tela de Início do iOS ele nunca responde)
    this.watchdog = setTimeout(() => { if (this.rec === rec && this.voiceOn && !this.recStarted) this.voiceUnavailable('timeout'); }, isStandalone ? 4000 : 8000);
    rec.onstart = () => { this.voiceErrors = 0; };
    rec.onaudiostart = () => { this.recStarted = true; clearTimeout(this.watchdog); };
    rec.onspeechstart = () => { this.recStarted = true; clearTimeout(this.watchdog); };
    rec.onresult = e => {
      this.recStarted = true; clearTimeout(this.watchdog);
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const words = e.results[i][0].transcript.trim().split(/\s+/).map(normalizeWord).filter(Boolean);
        const done = this.consumed.get(i) || 0;
        words.slice(done).forEach(w => this.consumeWord(w));
        this.consumed.set(i, Math.max(done, words.length));
      }
    };
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.voiceErrors++;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.voiceUnavailable(e.error); return; }
      if (this.voiceErrors >= 3) { toast('Voz indisponível agora (' + (voiceErrorText[e.error] || e.error) + '). Rolagem automática ativada.', 4500); this.setVoice(false); this.setPlaying(true); }
      else toast('Voz: ' + (voiceErrorText[e.error] || e.error), 3000);
    };
    rec.onend = () => { if (this.rec === rec && this.voiceOn) { clearTimeout(this.restartTimer); this.restartTimer = setTimeout(() => { if (this.rec === rec && this.voiceOn) { this.consumed = new Map(); try { rec.start(); } catch { } } }, 250); } };
    try { rec.start(); } catch (err) { toast('Não consegui iniciar o microfone'); }
  },
  voiceUnavailable(code) {
    this.setVoice(false);
    if (isIOS && isStandalone) { // sem saída na web: mandar para o Safari, onde o reconhecimento funciona
      $('#open-safari').href = location.href.split('#')[0];
      closeSheets('#sheet-safari'); $('#sheet-safari').classList.remove('hidden');
      return;
    }
    toast(code === 'timeout' ? 'O reconhecimento de voz não respondeu. Confira o microfone e tente de novo.' : (voiceErrorText[code] || ('Voz indisponível: ' + code)), 5000);
  },
  stopVoice() {
    clearTimeout(this.restartTimer); clearTimeout(this.watchdog);
    if (this.rec) { const r = this.rec; this.rec = null; try { r.onend = null; r.stop(); } catch { } }
  },
  wordsMatch(a, b) {
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4) {
      if (a.startsWith(b) || b.startsWith(a)) return true;
      if (lev(a, b) <= (a.length >= 7 ? 2 : 1)) return true;
    }
    return false;
  },
  // Regra: o leitor pode improvisar fora do roteiro ("não é?", "olha só"…). Nesses momentos o app
  // simplesmente espera. Só avança quando a fala bate com o roteiro logo à frente.
  consumeWord(w) {
    const T = this.tokens; if (!T.length) return;
    this.recent.push(w); if (this.recent.length > 4) this.recent.shift();
    // salto confirmado: a palavra anterior bateu mais adiante e esta é a seguinte
    if (this.pending >= 0) {
      const p = this.pending; this.pending = -1;
      for (let t = p + 1; t < Math.min(T.length, p + 3); t++) {
        if (T[t] && this.wordsMatch(w, T[t])) { this.pos = t + 1; this.misses = 0; this.targetToPos(); return; }
      }
    }
    const look = w.length <= 2 ? 3 : w.length === 3 ? 6 : 16;
    for (let j = this.pos; j < Math.min(T.length, this.pos + look); j++) {
      if (!T[j] || !this.wordsMatch(w, T[j])) continue;
      if (j <= this.pos + 3) { this.pos = j + 1; this.misses = 0; this.targetToPos(); return; }
      this.pending = j; break; // longe demais para uma palavra só: espera a próxima confirmar
    }
    // não bateu: improviso, ruído ou o leitor saiu do roteiro. Espera.
    this.misses++;
    if (this.misses >= 6) this.relocate();
  },
  // Caso extremo (muitas palavras sem bater): as três últimas palavras ditas aparecem, em sequência,
  // em UM único lugar do roteiro. Só então o app pula para lá. Em qualquer dúvida, não pula.
  relocate() {
    const T = this.tokens, R = this.recent.slice(-3); if (R.length < 3) return;
    if (R.filter(r => r.length >= 4).length < 2) return; // precisa de pelo menos duas palavras "cheias"
    const hits = [];
    for (let i = 0; i < T.length && hits.length < 2; i++) {
      if (!T[i] || !this.wordsMatch(R[0], T[i])) continue; // a primeira palavra ancora exatamente em i
      let k = i + 1, ok = true;
      for (const r of R.slice(1)) {
        let found = -1;
        for (let t = k; t < Math.min(T.length, k + 2); t++) { if (T[t] && this.wordsMatch(r, T[t])) { found = t; break; } }
        if (found < 0) { ok = false; break; }
        k = found + 1;
      }
      if (ok) hits.push(k);
    }
    if (hits.length === 1) { this.pos = hits[0]; this.misses = 0; this.targetToPos(); }
  },
  // posição exibida = palavra reconhecida + antecipação (o reconhecimento chega com atraso)
  displayPos() { return Math.min(this.spans.length, this.pos + (settings.voiceLead | 0)); },
  targetToPos() {
    const span = this.spans[Math.max(0, this.displayPos() - 1)]; if (!span) return;
    const lineTop = span.offsetTop; // relativo ao conteúdo (padding-top = linha de leitura)
    const t = Math.max(0, Math.min(this.maxScroll(), lineTop - this.lineOffset()));
    // só rola quando a palavra atual já saiu da linha de leitura (evita tremer a cada palavra)
    if (Math.abs(t - this.scrollY) > settings.fontSize * 0.5) this.target = t;
    this.highlight();
  },
  highlight(clear = false) {
    if (clear) { this.spans.forEach(s => s.classList.remove('read', 'cur')); this.lastHi = 0; return; }
    const end = this.displayPos();
    for (let i = 0; i < this.spans.length; i++) {
      const s = this.spans[i];
      const read = i < end - 1, cur = i === end - 1;
      if (s.classList.contains('read') !== read) s.classList.toggle('read', read);
      if (s.classList.contains('cur') !== cur) s.classList.toggle('cur', cur);
    }
  },
  nearestIndexToLine() {
    const y = this.scrollY + this.lineOffset();
    let best = 0, bestD = Infinity;
    this.spans.forEach((s, i) => { const d = Math.abs(s.offsetTop - y); if (d < bestD) { bestD = d; best = i; } });
    return best;
  },
  syncPosToScroll() { // após rolar com o dedo: a palavra na linha de leitura vira a palavra atual (descontando a antecipação)
    const near = this.nearestIndexToLine();
    this.pos = Math.max(0, near - (settings.voiceLead | 0));
    if (near === 0 || this.scrollY <= 1) this.pos = 0;
    this.recent = []; this.misses = 0; this.pending = -1; this.target = null; this.highlight();
  },

  // ---- toque/arraste no texto ----
  manualTouch: false, touchStart: null,
  bindTouch() {
    const sc = this.el.scroller;
    const start = (x, y) => { this.touchStart = { x, y, t: Date.now() }; this.manualTouch = true; };
    const end = (x, y) => {
      this.manualTouch = false; this.scrollY = sc.scrollTop;
      if (this.touchStart && Math.hypot(x - this.touchStart.x, y - this.touchStart.y) < 10 && Date.now() - this.touchStart.t < 400) {
        if (this.voiceOn) toast(this.rec ? 'Modo voz ativo: fale e o texto acompanha' : 'Modo voz ativo'); else this.togglePlay();
      } else if (this.voiceOn) this.syncPosToScroll();
      this.touchStart = null; this.updateEta();
    };
    let usedTouch = false; // evita que o toque gere também mousedown/mouseup sintéticos (toggle duplo)
    sc.addEventListener('touchstart', e => { usedTouch = true; start(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    sc.addEventListener('touchend', e => end(e.changedTouches[0].clientX, e.changedTouches[0].clientY));
    sc.addEventListener('touchcancel', () => { this.manualTouch = false; this.touchStart = null; this.scrollY = sc.scrollTop; });
    sc.addEventListener('mousedown', e => { if (!usedTouch) start(e.clientX, e.clientY); });
    sc.addEventListener('mouseup', e => { if (!usedTouch) end(e.clientX, e.clientY); });
    sc.addEventListener('wheel', () => { this.scrollY = sc.scrollTop; if (this.voiceOn) this.syncPosToScroll(); this.updateEta(); }, { passive: true });
    // rolagem inercial do dedo depois do touchend: quando parar, ressincroniza a posição da voz
    sc.addEventListener('scroll', () => {
      if (this.manualTouch) return;
      if (performance.now() - this.lastProgScroll < 150) return; // rolagem feita pelo próprio app
      this.scrollY = sc.scrollTop;
      clearTimeout(this.scrollSyncTimer);
      this.scrollSyncTimer = setTimeout(() => { if (this.voiceOn) this.syncPosToScroll(); this.updateEta(); }, 180);
    }, { passive: true });
  },

  async requestWakeLock() {
    try { if ('wakeLock' in navigator) { this.wakeLock = await navigator.wakeLock.request('screen'); } } catch { }
  },
  releaseWakeLock() { try { this.wakeLock && this.wakeLock.release(); } catch { } this.wakeLock = null; },
};
Prompter.bindTouch();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && currentView === 'prompter') Prompter.requestWakeLock(); });
window.addEventListener('resize', () => { if (currentView === 'prompter') { Prompter.layoutLine(); Prompter.updateEta(); } });

// botões do teleprompter
$('#pr-back').addEventListener('click', () => { showView('list'); List.render(); });
$('#pr-edit').addEventListener('click', () => { const id = Prompter.script.id; Prompter.leave(); Editor.open(id, 'prompter'); });
$('#pr-fullscreen').addEventListener('click', async () => {
  const el = document.documentElement;
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (el.requestFullscreen) await el.requestFullscreen(); else toast('No iPhone: Compartilhar → “Adicionar à Tela de Início” para abrir em tela cheia'); } catch { toast('Tela cheia indisponível aqui'); }
});
$('#t-play').addEventListener('click', () => Prompter.togglePlay());
$('#c-play').addEventListener('click', () => Prompter.togglePlay());
$('#c-restart').addEventListener('click', () => Prompter.restart());
$('#c-rew').addEventListener('click', () => Prompter.nudge(-1));
$('#c-ffw').addEventListener('click', () => Prompter.nudge(1));
$('#t-voice').addEventListener('click', () => Prompter.setVoice(!Prompter.voiceOn));
$('#s-voice').addEventListener('change', e => Prompter.setVoice(e.target.checked));

const sheets = ['#sheet-settings', '#sheet-palette', '#after-record', '#sheet-safari'];
$('#safari-auto').addEventListener('click', () => { closeSheets(); Prompter.togglePlay(); });
$('#open-safari').addEventListener('click', () => setTimeout(closeSheets, 500));
function closeSheets(except) { sheets.forEach(s => { if (s !== except) $(s).classList.add('hidden'); }); }
function toggleSheet(sel) { const el = $(sel); const show = el.classList.contains('hidden'); closeSheets(sel); el.classList.toggle('hidden', !show); if (show && sel === '#sheet-settings') Prompter.updateEta(); }
$('#t-settings').addEventListener('click', () => toggleSheet('#sheet-settings'));
$('#c-close').addEventListener('click', () => closeSheets());
$('#t-palette').addEventListener('click', () => toggleSheet('#sheet-palette'));
$('#p-close').addEventListener('click', () => closeSheets());

function bindRange(id, key, label, fmt = v => v, after) {
  $(id).addEventListener('input', e => { settings[key] = +e.target.value; $(label).textContent = fmt(settings[key]); saveSettings(); Prompter.applySettings(); after && after(); });
}
bindRange('#s-font', 'fontSize', '#s-font-v', v => v, () => { Prompter.layoutLine(); if (Prompter.voiceOn) Prompter.targetToPos(); Prompter.updateEta(); });
bindRange('#s-speed', 'speed', '#s-speed-v', v => v, () => Prompter.updateEta());
bindRange('#s-count', 'countdown', '#s-count-v');
bindRange('#s-lead', 'voiceLead', '#s-lead-v', v => v, () => { if (Prompter.voiceOn) Prompter.targetToPos(); });
bindRange('#p-line', 'linePos', '#p-line-v', v => v + '%', () => Prompter.layoutLine());
bindRange('#p-margin', 'margin', '#p-margin-v', v => v, () => Prompter.updateEta());
bindRange('#p-opacity', 'camBoxOpacity', '#p-opacity-v', v => v + '%');
// Deitado, a câmera frontal fica à esquerda ou à direita conforme o giro do iPhone.
// Ângulo 90 = topo do aparelho à esquerda (câmera à esquerda); 270 = câmera à direita.
function detectCamSide() {
  if (settings.camSide === 'left' || settings.camSide === 'right') return settings.camSide;
  const landscape = window.innerWidth > window.innerHeight;
  if (!landscape) return 'top';
  let a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
  a = ((a % 360) + 360) % 360;
  if (a === 90) return 'left';
  if (a === 270) return 'right';
  return 'right'; // sem informação: iPhone costuma ser girado com a câmera à direita
}
function applyCamSide() {
  const side = detectCamSide();
  body.classList.toggle('cam-left', side === 'left'); body.classList.toggle('cam-right', side === 'right');
  if (currentView === 'prompter') { Prompter.layoutLine(); if (Prompter.voiceOn) Prompter.targetToPos(); }
}
window.addEventListener('resize', applyCamSide);
window.addEventListener('orientationchange', () => setTimeout(applyCamSide, 150));
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => setTimeout(applyCamSide, 150));
$('#btn-side').addEventListener('click', () => {
  const cur = detectCamSide();
  settings.camSide = cur === 'left' ? 'right' : 'left'; saveSettings(); applyCamSide();
  toast(settings.camSide === 'left' ? 'Caixa à esquerda (câmera à esquerda)' : 'Caixa à direita (câmera à direita)', 2000);
});
// alça: arrastar a borda inferior da caixa de texto no modo câmera (ou a borda lateral, deitado)
(() => {
  const h = $('#box-handle'); let x0 = 0, y0 = 0, h0 = 0, w0 = 0, side = 'top';
  const start = (x, y) => { x0 = x; y0 = y; side = detectCamSide(); const r = Prompter.el.prompter.getBoundingClientRect(); h0 = r.height; w0 = r.width; };
  const move = (x, y) => {
    if (side === 'top') {
      const pct = Math.max(15, Math.min(70, (h0 + (y - y0)) / window.innerHeight * 100));
      settings.camBoxHeight = Math.round(pct); document.documentElement.style.setProperty('--cam-box-h', settings.camBoxHeight + '%');
    } else {
      const dx = side === 'left' ? (x - x0) : (x0 - x);
      const pct = Math.max(28, Math.min(75, (w0 + dx) / window.innerWidth * 100));
      settings.camBoxWidth = Math.round(pct); document.documentElement.style.setProperty('--cam-box-w', settings.camBoxWidth + '%');
    }
    Prompter.layoutLine();
  };
  const end = () => { saveSettings(); Prompter.layoutLine(); if (Prompter.voiceOn) Prompter.targetToPos(); Prompter.updateEta(); };
  h.addEventListener('touchstart', e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  h.addEventListener('touchmove', e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  h.addEventListener('touchend', end);
  h.addEventListener('mousedown', e => { start(e.clientX, e.clientY); const mm = ev => move(ev.clientX, ev.clientY); const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); }; window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); });
})();
// durante a gravação, um toque na imagem mostra os controles por alguns segundos
let recPeek = 0;
$('#cam').addEventListener('click', () => {
  if (!Camera.recording()) return;
  body.classList.remove('rec-hide'); clearTimeout(recPeek);
  recPeek = setTimeout(() => { if (Camera.recording()) body.classList.add('rec-hide'); }, 4000);
});
$('#p-mirror').addEventListener('change', e => { settings.mirror = e.target.checked; saveSettings(); Prompter.applySettings(); });
$('#p-bold').addEventListener('change', e => { settings.bold = e.target.checked; saveSettings(); Prompter.applySettings(); });
$('#swatches').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.color = b.dataset.c; saveSettings(); Prompter.applySettings(); });

// ---------- câmera e gravação ----------
const Camera = {
  stream: null, recorder: null, chunks: [], startAt: 0, timer: 0, lastBlob: null, lastUrl: null,
  on() { return !!this.stream; },
  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Câmera indisponível neste navegador'); return false; }
    try {
      const constraints = {
        video: { facingMode: settings.rear ? 'environment' : 'user', width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60, max: 60 } },
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      try { this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: settings.rear ? 'environment' : 'user' }, audio: true }); }
      catch (e2) { toast('Não consegui acessar a câmera: ' + (e2.message || e2.name)); return false; }
    }
    const v = $('#cam'); v.srcObject = this.stream; try { await v.play(); } catch { }
    body.classList.add('cam-on'); $('#rec-ui').classList.remove('hidden'); $('#t-camera').classList.add('active');
    const track = this.stream.getVideoTracks()[0]; const s = track.getSettings ? track.getSettings() : {};
    if (s.width) toast(`Câmera ${s.width}×${s.height}${s.frameRate ? ' • ' + Math.round(s.frameRate) + ' fps' : ''}`, 1800);
    Prompter.layoutLine(); Prompter.updateEta();
    return true;
  },
  stop() {
    if (this.recorder && this.recorder.state !== 'inactive') { try { this.recorder.stop(); } catch { } }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    $('#cam').srcObject = null;
    body.classList.remove('cam-on', 'rec-hide'); $('#rec-ui').classList.add('hidden'); $('#t-camera').classList.remove('active');
    if (currentView === 'prompter') { Prompter.layoutLine(); Prompter.updateEta(); }
  },
  async toggle() { if (this.on()) this.stop(); else await this.start(); },
  async flip() { settings.rear = !settings.rear; saveSettings(); body.classList.toggle('cam-rear', settings.rear); if (this.on()) { this.stop(); await this.start(); } },
  pickMime() {
    const list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    if (!window.MediaRecorder) return null;
    for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
    return '';
  },
  recording() { return this.recorder && this.recorder.state === 'recording'; },
  async toggleRecord() {
    if (this.recording()) { this.stopRecord(); return; }
    if (!this.on() && !(await this.start())) return;
    const mime = this.pickMime();
    if (mime === null) { toast('Gravação não suportada neste navegador'); return; }
    try {
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, videoBitsPerSecond: 24e6, audioBitsPerSecond: 192e3 } : undefined);
    } catch (e) { toast('Não consegui iniciar a gravação: ' + e.message); return; }
    this.chunks = [];
    this.recorder.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.recorder.onstop = () => this.finish();
    const begin = () => {
      this.recorder.start(1000); this.startAt = Date.now();
      $('#btn-record').classList.add('on'); $('#rec-time').classList.add('on');
      closeSheets(); body.classList.add('rec-hide');
      clearInterval(this.timer); this.timer = setInterval(() => { $('#rec-time').textContent = fmtTime((Date.now() - this.startAt) / 1000); }, 250);
      if (!Prompter.voiceOn) Prompter.setPlaying(true);
    };
    Prompter.startWithCountdown(begin);
  },
  stopRecord() {
    clearInterval(this.timer); clearTimeout(recPeek);
    $('#btn-record').classList.remove('on'); $('#rec-time').classList.remove('on'); body.classList.remove('rec-hide');
    Prompter.setPlaying(false);
    try { this.recorder.stop(); } catch { }
  },
  async finish() {
    const type = this.recorder.mimeType || (this.chunks[0] && this.chunks[0].type) || 'video/mp4';
    const blob = new Blob(this.chunks, { type }); this.chunks = [];
    if (!blob.size) { toast('A gravação ficou vazia'); return; }
    const duration = (Date.now() - this.startAt) / 1000;
    const draft = { id: uid(), createdAt: Date.now(), duration, size: blob.size, type, scriptTitle: Prompter.script ? (Prompter.script.title || fmtDate(Prompter.script.createdAt)) : '', blob };
    try { await Drafts.put(draft); } catch { toast('Não consegui guardar nos rascunhos (espaço?). Salve agora.'); }
    this.lastBlob = blob; this.lastDraft = draft;
    if (this.lastUrl) URL.revokeObjectURL(this.lastUrl); this.lastUrl = URL.createObjectURL(blob);
    $('#after-video').src = this.lastUrl;
    closeSheets('#after-record'); $('#after-record').classList.remove('hidden');
    $('#rec-time').textContent = '00:00';
  },
  ext(type) { return /mp4/.test(type) ? 'mp4' : /quicktime/.test(type) ? 'mov' : 'webm'; },
  fileName(d) { const dt = new Date(d.createdAt); const p = n => String(n).padStart(2, '0'); return `Teleprompter ${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}${p(dt.getMinutes())}.${this.ext(d.type)}`; },
};
$('#t-camera').addEventListener('click', () => Camera.toggle());
$('#btn-flip').addEventListener('click', () => Camera.flip());
$('#btn-record').addEventListener('click', () => Camera.toggleRecord());
$('#ar-close').addEventListener('click', () => { closeSheets(); $('#after-video').pause(); });
$('#ar-save').addEventListener('click', () => Camera.lastBlob && saveToPhotos(Camera.lastBlob, Camera.fileName(Camera.lastDraft)));
$('#ar-share').addEventListener('click', () => Camera.lastBlob && shareOrDownload(Camera.lastBlob, Camera.fileName(Camera.lastDraft), 'Gravação do teleprompter'));
$('#ar-drafts').addEventListener('click', () => { closeSheets(); Drafts.open(); });

// ---------- rascunhos (IndexedDB) ----------
const Drafts = {
  dbp: null,
  db() {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB indisponível')); return; }
      const r = indexedDB.open('teleprompter', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.dbp;
  },
  async tx(mode, fn) { const db = await this.db(); return new Promise((res, rej) => { const t = db.transaction('drafts', mode); const req = fn(t.objectStore('drafts')); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); },
  put(d) { return this.tx('readwrite', s => s.put(d)); },
  del(id) { return this.tx('readwrite', s => s.delete(id)); },
  all() { return this.tx('readonly', s => s.getAll()); },
  urls: [],
  async open() {
    showView('drafts');
    const ul = $('#draft-list'); ul.innerHTML = '';
    this.urls.forEach(u => URL.revokeObjectURL(u)); this.urls = [];
    let list = [];
    try { list = (await this.all()) || []; } catch { ul.innerHTML = '<li class="empty">Não consegui abrir os rascunhos neste navegador.</li>'; return; }
    list.sort((a, b) => b.createdAt - a.createdAt);
    if (!list.length) { ul.innerHTML = '<li class="empty">Nenhuma gravação ainda. No teleprompter, toque na câmera e depois no botão vermelho.</li>'; return; }
    for (const d of list) {
      const li = document.createElement('li');
      const url = URL.createObjectURL(d.blob); this.urls.push(url);
      li.innerHTML = `<video controls playsinline preload="metadata"></video>
        <div class="meta"><span></span><span></span></div>
        <div class="actions"><button class="text-btn primary save"><svg><use href="#i-photo"/></svg> Salvar nas Fotos</button><button class="text-btn share"><svg><use href="#i-share"/></svg> Compartilhar</button><button class="text-btn danger del"><svg><use href="#i-trash"/></svg> Excluir</button></div>`;
      li.querySelector('video').src = url;
      const [m1, m2] = li.querySelectorAll('.meta span');
      m1.textContent = `${fmtDate(d.createdAt)}${d.scriptTitle ? ' • ' + d.scriptTitle : ''}`;
      m2.textContent = `${fmtTime(d.duration)} • ${fmtSize(d.size)}`;
      li.querySelector('.save').addEventListener('click', () => saveToPhotos(d.blob, Camera.fileName(d)));
      li.querySelector('.share').addEventListener('click', () => shareOrDownload(d.blob, Camera.fileName(d), 'Gravação do teleprompter'));
      li.querySelector('.del').addEventListener('click', async () => { if (!await confirmModal('Excluir esta gravação?', 'Não é possível desfazer.')) return; await this.del(d.id); this.open(); });
      ul.appendChild(li);
    }
  },
};
$('#dr-back').addEventListener('click', () => { showView('list'); List.render(); });

// ---------- sincronização com Google Docs (via Apps Script) ----------
const Sync = {
  busy: false,
  hidden() { try { return JSON.parse(localStorage.getItem('tp.hidden') || '{}'); } catch { return {}; } },
  setHidden(h) { try { localStorage.setItem('tp.hidden', JSON.stringify(h)); } catch { } },
  configured() { return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(settings.syncUrl || ''); },
  async run(silent = false) {
    if (!this.configured()) { if (!silent) toast('Configure o endereço do Apps Script em “Google Docs”'); return; }
    if (this.busy) return; this.busy = true;
    $('#m-sync').classList.add('busy');
    try {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(settings.syncUrl + '?action=list&t=' + Date.now(), { signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || !Array.isArray(data.scripts)) throw new Error(data && data.error ? data.error : 'resposta inesperada');
      const result = this.apply(data.scripts);
      settings.lastSync = Date.now(); saveSettings(); List.render();
      if (!silent || result.changed) toast(result.changed ? `Google Docs: ${result.added} novo(s), ${result.updated} atualizado(s)` : 'Google Docs: nada novo', 2200);
    } catch (e) {
      if (!silent) toast('Falha ao sincronizar: ' + (e.name === 'AbortError' ? 'tempo esgotado' : e.message), 4000);
    } finally { this.busy = false; $('#m-sync').classList.remove('busy'); }
  },
  apply(list) {
    const hidden = this.hidden(); let added = 0, updated = 0, hiddenChanged = false;
    for (const d of list) {
      if (!d || !d.id || d.body == null) continue;
      const id = 'gdoc:' + d.id, updatedAt = +d.updatedAt || Date.now();
      if (hidden[id]) { if (hidden[id] >= updatedAt) continue; delete hidden[id]; hiddenChanged = true; }
      const local = scripts.find(s => s.id === id);
      const body = String(d.body).replace(/\r\n/g, '\n').trim(), title = (d.title || '').trim();
      if (!local) { scripts.push({ id, title, body, createdAt: updatedAt, updatedAt, source: 'gdocs' }); added++; }
      else if (updatedAt > (local.syncedAt || 0) && (local.body !== body || local.title !== title)) { local.title = title; local.body = body; local.updatedAt = updatedAt; local.source = 'gdocs'; updated++; }
      if (local) local.syncedAt = updatedAt; else scripts[scripts.length - 1].syncedAt = updatedAt;
    }
    if (hiddenChanged) this.setHidden(hidden);
    if (added || updated) Store.save(scripts);
    return { added, updated, changed: !!(added || updated) };
  },
  hide(ids) { // roteiro do Docs excluído no app: fica oculto até o documento mudar
    const h = this.hidden();
    for (const id of ids) { const s = scripts.find(x => x.id === id); if (s && s.source === 'gdocs') h[id] = s.syncedAt || s.updatedAt || Date.now(); }
    this.setHidden(h);
  },
};
$('#m-sync').addEventListener('click', () => { menu.classList.add('hidden'); Sync.run(false); });
$('#m-sync-config').addEventListener('click', () => { menu.classList.add('hidden'); $('#sync-url').value = settings.syncUrl || ''; $('#sheet-sync').classList.remove('hidden'); });
$('#sync-close').addEventListener('click', () => $('#sheet-sync').classList.add('hidden'));
$('#sync-save').addEventListener('click', () => {
  const url = $('#sync-url').value.trim();
  if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) { toast('Cole o endereço que termina em /exec'); return; }
  settings.syncUrl = url; saveSettings(); $('#sheet-sync').classList.add('hidden');
  if (url) Sync.run(false); else toast('Sincronização desligada');
});

// ---------- início ----------
List.render();
if (Sync.configured()) Sync.run(true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && currentView === 'list' && Sync.configured() && Date.now() - (settings.lastSync || 0) > 60000) Sync.run(true); });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

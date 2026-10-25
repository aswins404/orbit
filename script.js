const DEFAULT_FOLDER_URL = 'https://mega.nz/folder/YL9WADpL#7e4H_6oD_CQKNzfPBvNRSw';
const DEFAULT_PLAYLIST_FOLDER_URL = 'https://mega.nz/folder/0XVXzJTR#FiT9lyC4jHbHYao4v5wVtw';
const MEGAJS_URL = 'https://unpkg.com/megajs@1.3.10/dist/main.browser-es.mjs';
const MEGAJS_UMD_URL = 'https://unpkg.com/megajs@1.3.10/dist/main.browser-umd.js';
const MAX_TRACK_BYTES = 200 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(['mp3','m4a','aac','ogg','opus','wav','flac','oga','weba','webm','mp4','aif','aiff','mid','midi','3gp']);

const $ = (selector) => document.querySelector(selector);
const ui = {
  form: $('#mega-form'), url: $('#mega-url'), load: $('#load-folder'), connection: $('#connection-label'), dot: $('#connection-dot'),
  status: $('#status-message'), folderProgress: $('#folder-progress'), folderProgressBar: $('#folder-progress-bar'), folderProgressLabel: $('#folder-progress-label'),
  file: $('#m3u-file'), localAudio: $('#local-audio-files'), clear: $('#clear-playlist'), search: $('#search-input'), list: $('#song-list'), tabs: [...document.querySelectorAll('.tab')],
  count: $('#track-count'), allBadge: $('#all-badge'), summary: $('#playlist-summary'), unmatched: $('#unmatched-panel'),
  footer: $('#library-footer-text'), updated: $('#library-updated'), audio: $('#audio'), nowTitle: $('#now-title'), nowFolder: $('#now-folder'), bars: $('#playing-bars'),
  current: $('#current-time'), total: $('#total-time'), seek: $('#seek'), message: $('#player-message'), play: $('#play-button'), previous: $('#previous-button'),
  next: $('#next-button'), shuffle: $('#shuffle-button'), repeat: $('#repeat-button'), volume: $('#volume'), volumeLabel: $('#volume-label'), mute: $('#mute-button'),
  queue: $('#queue-preview'), queueAll: $('#queue-play-all-library'), queuePagePlayAll: $('#queue-play-all'), queueStart: $('#queue-start'), queueCurrent: $('#queue-current-track'), queueSave: $('#save-queue-as-playlist'), queueSaveDialog: $('#queue-save-dialog'), queueSaveForm: $('#queue-save-form'), queuePlaylistName: $('#queue-playlist-name'), queueSaveFeedback: $('#queue-save-feedback'), queueSaveCancel: $('#cancel-queue-save'), queueSaveConfirm: $('#confirm-queue-save'), preloadIndicator: $('#next-preload-indicator'), preloadLabel: $('#next-preload-label'), preloadTrack: $('#next-preload-track'), preloadFill: $('#next-preload-fill'), importUrl: $('#playlist-mega-url'), previewMega: $('#preview-mega-playlist'), megaPreview: $('#mega-playlist-preview'), playlistChoices: $('#mega-playlist-choices'), importedMega: $('#imported-mega-playlists'), importedTabs: $('#imported-playlist-tabs'), edit: $('#edit-playlist'), save: $('#save-playlist'), download: $('#download-track'), shuffleOff: $('#shuffle-off-button'), cover: $('#cover-art'), albumArt: $('#album-art'), views: [...document.querySelectorAll('.page-view')], nav: [...document.querySelectorAll('[data-page]')], librarySidebar: $('#library-sidebar'), playlistSongList: $('#playlist-song-list')
};

const state = { page: 'home', MegaFile: null, megaImportPromise: null, root: null, rootUrl: null, songs: [], playlist: null, devicePlaylists: [], megaPlaylists: [], pendingImport: null, unmatched: [], view: 'all', currentId: null, currentSong: null, currentUrl: null, artUrl: null, activeDownloadStream: null, downloadProgress: null, failed: new Set(), shuffle: false, repeat: false, loading: false, loadToken: 0, playToken: 0, isSeeking: false, previousVolume: .75, queue: [], prioritized: new Set(), history: [], editMode: false, downloadCache: new Map(), downloadPromises: new Map(), preload: null, preloadFailure: null, preloadGeneration: 0, preloadIndicatorSignature: '', queueRenderSignature: '', sourceQueue: [], playlistDirty: false, collectionSignature: '', dashboardSignature: '', songRowNodes: new Map(), renderedList: null, savingQueuePlaylist: false };

function setPage(page) {
  if (!['home', 'queue', 'library', 'playlists'].includes(page)) return;
  const changed = state.page !== page;
  state.page = page;
  ui.views.forEach((view) => { view.hidden = view.id !== `${page}-view`; });
  ui.nav.forEach((button) => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  ui.librarySidebar.hidden = false;
  $('#page-heading').textContent = ({home:'Your listening room', queue:'Your queue', library:'Your library', playlists:'Your playlists'})[page];
  if (page === 'queue' && changed) renderQueue();
}
function updatePlaylistCount() {
  const playlists = [...state.megaPlaylists, ...state.devicePlaylists];
  $('#playlist-count').textContent = String(playlists.length);
}
function renderHomeDashboard() {
  const signature = `${state.rootUrl || ''}:${state.songs.length}|${state.megaPlaylists.map((p) => `${p.source || p.url}:${p.songs.length}`).join('|')}|${state.devicePlaylists.map((p) => `${p.id}:${p.songs.length}`).join('|')}`;
  if (signature === state.dashboardSignature) return;
  state.dashboardSignature = signature;
  const folders = new Map();
  if (state.root && state.rootUrl) folders.set(state.rootUrl, {url:state.rootUrl, name:state.root.name || 'Connected MEGA folder', songs:state.songs.length});
  for (const playlist of state.megaPlaylists) {
    const url = playlist.url || playlist.source;
    if (url && !folders.has(url)) folders.set(url, {url, name:playlist.folder?.name || playlist.name, songs:playlist.songs.length});
  }
  const distinctSongs = new Set([...state.songs, ...state.megaPlaylists.flatMap((p) => p.songs), ...state.devicePlaylists.flatMap((p) => p.songs)].map(trackIdentity));
  $('#home-connected-count').textContent = String(folders.size);
  $('#home-song-count').textContent = String(distinctSongs.size);
  $('#home-playlist-count').textContent = String(state.megaPlaylists.length + state.devicePlaylists.length);
  $('#connection-status-short').textContent = state.root ? 'MEGA connected' : 'Local session';
  $('#home-connection-list').innerHTML = folders.size ? [...folders.values()].map((folder) => `<div class="home-connection-item"><span class="connected-icon" aria-hidden="true">◉</span><span><strong>${escapeHTML(folder.name)}</strong><small>${escapeHTML(folder.url)}</small></span><span class="home-source-count">${folder.songs} tracks</span></div>`).join('') : '<div class="home-empty"><span aria-hidden="true">◌</span><p>No MEGA folders connected yet.</p><small>Load a public folder to see it here.</small></div>';
}

function setStatus(message, kind = '') {
  ui.status.className = `connection-status ${kind}`;
  ui.status.lastElementChild.textContent = message;
}
function setPlayerMessage(message, kind = '') {
  ui.message.className = `player-message ${kind}`;
  ui.message.textContent = message;
}
function updateNowTitleScroll() {
  if (!ui.nowTitle?.parentElement) return;
  const available = ui.nowTitle.parentElement.clientWidth;
  const distance = Math.max(0, ui.nowTitle.scrollWidth - available);
  ui.nowTitle.classList.toggle('scrolling', distance > 8);
  ui.nowTitle.style.setProperty('--scroll-distance', `${distance}px`);
}
function setFolderProgress(show, percent = null, label = '') {
  ui.folderProgress.hidden = !show;
  if (percent !== null) ui.folderProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (label) ui.folderProgressLabel.textContent = label;
}
async function loadMegaClient() {
  if (state.MegaFile) return state.MegaFile;
  if (!state.megaImportPromise) {
    state.megaImportPromise = (async () => {
      try {
        const module = await import(MEGAJS_URL);
        if (module.File && typeof module.File.fromURL === 'function') {
          state.MegaFile = module.File;
          console.info('[Orbit] MEGAJS browser ES module loaded:', MEGAJS_URL);
          return module.File;
        }
        throw new Error('The MEGA ES module loaded without the expected File API.');
      } catch (moduleError) {
        console.warn('[Orbit] ES module loading failed; trying the documented UMD browser build:', moduleError);
      }
      if (window.mega?.File && typeof window.mega.File.fromURL === 'function') {
        state.MegaFile = window.mega.File;
        return state.MegaFile;
      }
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-megajs-umd]');
        if (existing?.dataset.loaded === 'true') return resolve();
        const script = existing || document.createElement('script');
        const timeout = setTimeout(() => finish(new Error('Timed out loading the MEGA browser client from unpkg.')), 15000);
        const finish = (error) => {
          clearTimeout(timeout);
          script.removeEventListener('load', onLoad);
          script.removeEventListener('error', onError);
          if (error) {
            if (!existing) script.remove();
            reject(error);
          } else {
            script.dataset.loaded = 'true';
            resolve();
          }
        };
        const onLoad = () => finish();
        const onError = () => finish(new Error('Could not download the MEGA browser client from unpkg.'));
        script.addEventListener('load', onLoad, {once:true});
        script.addEventListener('error', onError, {once:true});
        if (!existing) {
          script.src = MEGAJS_UMD_URL;
          script.async = true;
          script.dataset.megajsUmd = 'true';
          document.head.append(script);
        }
      });
      if (!window.mega?.File || typeof window.mega.File.fromURL !== 'function') {
        throw new Error('The MEGA browser client loaded without the expected File API.');
      }
      state.MegaFile = window.mega.File;
      console.info('[Orbit] MEGAJS browser UMD client loaded:', MEGAJS_UMD_URL);
      return state.MegaFile;
    })().catch((error) => {
      state.megaImportPromise = null;
      throw error;
    });
  }
  return state.megaImportPromise;
}
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  return bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function normalPath(path) { return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim(); }
function normalizedMatch(path) { try { return decodeURIComponent(normalPath(path)).toLocaleLowerCase().replace(/\s+/g, ' '); } catch { return normalPath(path).toLocaleLowerCase().replace(/\s+/g, ' '); } }
function extOf(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }
function pathFor(node, parents) { return [...parents, node.name].filter(Boolean).join('/'); }
function renderMegaPlaylistChoices() {
  const groups = state.pendingImport?.groups || [];
  ui.playlistChoices.innerHTML = groups.map((group, index) => {
    const imported = state.megaPlaylists.find((item) => item.identity === group.identity);
    const unresolved = group.unmatched?.length ? ` · ${group.unmatched.length} unmatched` : '';
    const detail = group.kind === 'm3u' ? `${group.songs.length} matched ${group.songs.length === 1 ? 'song' : 'songs'} · ${group.entryCount} playlist entries${unresolved}` : `${group.songs.length} supported audio files`;
    const note = group.error ? ` · Could not read playlist: ${escapeHTML(group.error)}` : '';
    const unmatchedNames = group.unmatched?.length ? `<details class="mega-unmatched"><summary>Unmatched song names</summary><small>${group.unmatched.map(escapeHTML).join('<br>')}</small></details>` : '';
    const action = imported
      ? `data-remove-mega="${escapeHTML(imported.id)}" aria-label="Remove ${escapeHTML(group.name)} from Collection">Remove`
      : `data-mega-choice="${index}" aria-label="Import ${escapeHTML(group.name)}">Import`;
    return `<div class="mega-playlist-choice"><span><strong>${escapeHTML(group.name)}</strong><small>${detail}${note}</small>${unmatchedNames}</span><button type="button" class="text-button" ${action}</button></div>`;
  }).join('');
}
function downloadMegaTextBytes(file, maxBytes = 8 * 1024 * 1024) {
  if (typeof file.downloadBuffer === 'function') return file.downloadBuffer();
  if (typeof file.download !== 'function') return Promise.reject(new Error('This MEGA client cannot download the playlist file.'));
  return new Promise((resolve, reject) => {
    let stream;
    try { stream = file.download({forceHttps:true}); } catch (error) { reject(error); return; }
    const chunks = []; let size = 0; let settled = false;
    const finish = (error, bytes) => {
      if (settled) return; settled = true;
      stream.removeListener?.('data', onData); stream.removeListener?.('end', onEnd); stream.removeListener?.('error', onError);
      if (error) { stream.destroy?.(); reject(error); } else resolve(bytes);
    };
    const onData = (chunk) => {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      size += bytes.byteLength;
      if (size > maxBytes) return finish(new Error('The M3U file is larger than the 8 MB import limit.'));
      chunks.push(bytes);
    };
    const onEnd = () => {
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      finish(null, bytes);
    };
    const onError = (error) => finish(error);
    stream.on('data', onData); stream.once('end', onEnd); stream.once('error', onError);
  });
}
async function findMegaPlaylistFiles(folder, parents = [], found = []) {
  for (const child of folder.children || []) {
    if (child.directory) {
      if (typeof child.loadAttributes === 'function' && !Array.isArray(child.children)) await child.loadAttributes();
      await findMegaPlaylistFiles(child, [...parents, child.name], found);
    } else if (/\.m3u8?$/i.test(child.name || '')) found.push({ file:child, path:pathFor(child, parents) });
  }
  return found;
}
async function walkFolder(folder, parents = [], found = [], namespace = 'main') {
  for (const child of folder.children || []) {
    const path = pathFor(child, parents);
    if (child.directory) {
      // MEGAJS folder handles can expose their children only after attributes load.
      if (typeof child.loadAttributes === 'function' && !Array.isArray(child.children)) await child.loadAttributes();
      await walkFolder(child, [...parents, child.name], found, namespace);
    }
    else if (AUDIO_EXTENSIONS.has(extOf(child.name))) found.push({ id: `${namespace}:${child.nodeId || `${path}:${child.size}`}`, name: child.name, path, size: Number(child.size) || 0, file: child, durationHint: null, source: namespace });
  }
  return found;
}
function visibleSongs() {
  const source = collectionSource();
  const query = ui.search.value.trim().toLocaleLowerCase();
  return source.filter((song) => !query || `${song.name} ${song.path}`.toLocaleLowerCase().includes(query));
}
function collectionSource() {
  if (state.view === 'all') return state.songs;
  if (state.view.startsWith('device-')) return state.devicePlaylists.find((playlist) => playlist.id === state.view)?.songs || [];
  const imported = state.megaPlaylists.find((playlist) => playlist.id === state.view);
  return imported?.songs || [];
}
function devicePlaylistSummaryText(playlist) {
  if (playlist.source === 'Queue snapshot') return `Queue playlist · ${playlist.songs.length} tracks · Saved from the current song and upcoming queue order${playlist.dirty ? ' · Unsaved edits' : ''}.`;
  return `Device playlist · ${playlist.fileName} · ${playlist.songs.length} matched tracks · ${playlist.dirty ? 'Unsaved edits' : 'No unsaved edits'}. Local paths are resolved only from files you selected on this device.`;
}
function currentQueue() { return state.sourceQueue.length ? state.sourceQueue : collectionSource(); }
function shuffleArray(items) { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
function upcomingQueue() { return state.queue[0]?.id === state.currentId ? state.queue.slice(1) : state.queue; }
function nextQueuedSong() { return state.queue[0]?.id === state.currentId ? state.queue[1] || null : state.queue[0] || null; }
function trackIdentity(song) { return song?.originalId || song?.id; }
function syncQueue() { if (state.page === 'queue') renderQueue(); updateNextPreloadIndicator(); }
function setPlaybackSource(song, source) {
  const protectedEntries = state.queue.filter((item) => state.prioritized.has(item.id) && item.id !== song.id);
  state.prioritized.delete(song.id);
  state.sourceQueue = [...source];
  const index = state.sourceQueue.findIndex((item) => item.id === song.id);
  let upcoming = index < 0 ? state.sourceQueue.filter((item) => item.id !== song.id) : [...state.sourceQueue.slice(index + 1), ...state.sourceQueue.slice(0, index)];
  upcoming = upcoming.filter((item) => !state.prioritized.has(item.id) && !protectedEntries.some((prioritized) => prioritized.id === item.id));
  if (state.shuffle && upcoming.length > 1) upcoming = shuffleArray(upcoming);
  state.queue = [...protectedEntries, ...upcoming];
}
function applyQueueChange() {
  const target = nextQueuedSong();
  if (!state.preload || state.preload.id !== target?.id) { state.preloadGeneration++; cancelPreload(); }
  updateQueueCounts(); ui.next.disabled = !upcomingQueue().length; ui.queueStart.disabled = !upcomingQueue().length;
  if (state.page === 'queue') renderQueue();
  updateNextPreloadIndicator(); maybePreload();
}
function cancelPreload() {
  const old = state.preload;
  state.preload = null;
  if (!old) return;
  const download = state.downloadPromises.get(old.id);
  if (download?.purpose === 'preload') { download.cancelled = true; state.downloadPromises.delete(old.id); state.downloadCache.delete(old.id); download.stream?.destroy?.(); }
  else if (state.currentId !== old.id) state.downloadCache.delete(old.id);
}
function maybePreload() {
  const current = state.currentSong, target = nextQueuedSong();
  if (!current || !target) { cancelPreload(); state.preloadFailure = null; updateNextPreloadIndicator(); return; }
  if (state.preloadFailure?.id === target.id && state.preload?.id !== target.id) { updateNextPreloadIndicator(); return; }
  if (state.preload?.id !== target.id) {
    cancelPreload(); state.preloadFailure = null;
    state.preload = {id:target.id, generation:++state.preloadGeneration, status:'waiting', received:0, total:Number(target.size)||0, percent:null, ready:false, stream:null};
  }
  const record = state.preload;
  if (state.preloadFailure?.id === target.id) { updateNextPreloadIndicator(); return; }
  if (state.downloadCache.has(target.id)) {
    record.ready = true; record.status = 'ready'; record.percent = 100; updateNextPreloadIndicator(); return;
  }
  updateNextPreloadIndicator();
  if (!Number.isFinite(ui.audio.duration) || ui.audio.currentTime < ui.audio.duration * .5) return;
  if (record.status === 'downloading' || record.ready) return;
  record.status = 'preparing'; updateNextPreloadIndicator();
  const promise = getSongBlob(target, 'preload');
  record.promise = promise;
  const active = state.downloadPromises.get(target.id);
  if (active) record.stream = active.stream;
  promise.then(() => {
    record.ready = true;
    record.status = 'ready'; record.percent = 100;
    if (state.preload === record && record.generation === state.preloadGeneration) { updateNextPreloadIndicator(); if (state.page === 'queue') updateQueuePreloadStatus(target.id, 'Preloaded'); }
  }).catch((error) => {
    if (state.preload === record && record.generation === state.preloadGeneration) { state.preload = null; state.preloadFailure = {id:target.id, message:error.message}; updateNextPreloadIndicator(); if (state.page === 'queue') updateQueuePreloadStatus(target.id, 'Preload unavailable'); console.info('[Orbit] Preload unavailable:', error.message); }
  });
}
function updateNextPreloadIndicator() {
  const target = nextQueuedSong();
  if (!target) { ui.preloadIndicator.hidden = true; state.preloadIndicatorSignature = ''; return; }
  ui.preloadIndicator.hidden = false;
  const record = state.preload?.id === target.id ? state.preload : null;
  const failure = state.preloadFailure?.id === target.id ? state.preloadFailure : null;
  const status = failure ? 'Preloading unavailable' : record?.ready ? 'Next track ready' : record?.status === 'downloading' ? `Downloading next track${Number.isFinite(record.percent) ? ` · ${record.percent}%` : ''}` : record?.status === 'preparing' ? 'Preparing next track' : 'Preparing next track · starts at 50%';
  const message = `${status} · ${target.name}`;
  const showMeter = Boolean(record && record.status !== 'waiting' && !record.ready && !failure);
  const signature = `${target.id}|${message}|${showMeter}|${record?.percent ?? 'unknown'}|${Boolean(failure)}`;
  if (signature === state.preloadIndicatorSignature) return;
  state.preloadIndicatorSignature = signature;
  ui.preloadLabel.textContent = message; ui.preloadLabel.title = message;
  ui.preloadTrack.hidden = !showMeter;
  ui.preloadTrack.classList.toggle('indeterminate', showMeter && !Number.isFinite(record?.percent));
  if (showMeter && Number.isFinite(record?.percent)) ui.preloadTrack.setAttribute('aria-valuenow', String(record.percent));
  else ui.preloadTrack.removeAttribute('aria-valuenow');
  ui.preloadFill.style.width = Number.isFinite(record?.percent) ? `${record.percent}%` : '35%';
  ui.preloadIndicator.classList.toggle('preload-error', Boolean(failure));
  ui.preloadIndicator.classList.toggle('preload-ready', Boolean(record?.ready));
}
function updateQueuePreloadStatus(id, text) {
  const rows = ui.queue.querySelectorAll?.('[data-queue-song-id]') || [];
  for (const row of rows) if (row.dataset.queueSongId === id) { const status = row.querySelector('.queue-item-status'); if (status) status.textContent = text; }
}
function updateQueueCounts() {
  const count = upcomingQueue().length;
  $('#queue-count').textContent = String(count);
  $('#queue-count-label').textContent = String(count);
  ui.queueStart.disabled = count === 0;
}
function queueStatus(song) {
  if (state.preloadFailure?.id === song.id) return 'Unavailable';
  if (state.preload?.id === song.id) {
    if (state.preload.ready) return 'Preloaded';
    if (state.preload.status === 'downloading') return Number.isFinite(state.preload.percent) ? `${state.preload.percent}% downloaded` : 'Downloading';
    return state.preload.status === 'waiting' ? 'Preparing' : 'Preloading';
  }
  return state.prioritized.has(song.id) ? 'Play Next' : '';
}
function queueRowMarkup(song, index, count) {
  return `<div class="queue-item${state.prioritized.has(song.id) ? ' priority' : ''}" data-queue-song-id="${escapeHTML(song.id)}" draggable="true"><span class="queue-item-index">${String(index + 1).padStart(2,'0')}</span><span class="queue-item-title" title="${escapeHTML(song.name)}">${escapeHTML(song.name)}</span><span class="queue-item-path">${escapeHTML(song.path.split('/').slice(0,-1).join('/') || song.source || 'MEGA')} · Length ${song.durationHint ? formatTime(song.durationHint) : '—'}${song.size ? ` · Size ${formatSize(song.size)}` : ''}</span><span class="queue-item-status">${escapeHTML(queueStatus(song))}</span><span class="queue-actions"><button type="button" class="queue-prioritize" data-queue-play-next="${escapeHTML(song.id)}" aria-label="Play ${escapeHTML(song.name)} next">▶ <span>Play Next</span></button><button type="button" class="queue-move" data-move-queue="up" data-queue-id="${escapeHTML(song.id)}" aria-label="Move ${escapeHTML(song.name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="queue-move" data-move-queue="down" data-queue-id="${escapeHTML(song.id)}" aria-label="Move ${escapeHTML(song.name)} down" ${index === count - 1 ? 'disabled' : ''}>↓</button><button type="button" class="queue-remove" data-remove-queue="${escapeHTML(song.id)}" aria-label="Remove ${escapeHTML(song.name)} from queue">×</button></span></div>`;
}
function reconcileQueueRows(upcoming) {
  const nodes = [...(ui.queue.querySelectorAll?.('.queue-item[data-queue-song-id]') || [])];
  const byId = new Map(nodes.map((node) => [node.dataset.queueSongId, node]));
  if (!nodes.length || upcoming.some((song) => !byId.has(song.id))) {
    ui.queue.innerHTML = upcoming.map(queueRowMarkup).join('');
    return;
  }
  const wanted = new Set(upcoming.map((song) => song.id));
  for (const node of nodes) if (!wanted.has(node.dataset.queueSongId)) node.remove();
  upcoming.forEach((song, index) => {
    const node = byId.get(song.id);
    node.classList.toggle('priority', state.prioritized.has(song.id));
    const number = node.querySelector('.queue-item-index'); if (number) number.textContent = String(index + 1).padStart(2,'0');
    const title = node.querySelector('.queue-item-title'); if (title) { title.textContent = song.name; title.title = song.name; }
    const path = node.querySelector('.queue-item-path'); if (path) path.textContent = `${song.path.split('/').slice(0,-1).join('/') || song.source || 'MEGA'} · Length ${song.durationHint ? formatTime(song.durationHint) : '—'}${song.size ? ` · Size ${formatSize(song.size)}` : ''}`;
    const status = node.querySelector('.queue-item-status'); if (status) status.textContent = queueStatus(song);
    const up = node.querySelector('[data-move-queue="up"]'), down = node.querySelector('[data-move-queue="down"]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === upcoming.length - 1;
    const position = ui.queue.children[index];
    if (position !== node) ui.queue.insertBefore(node, position || null);
  });
}
function renderCollectionTabs() {
  const playlists = [...state.megaPlaylists, ...state.devicePlaylists];
  const signature = `${state.songs.length}|${playlists.map((p) => `${p.id}:${p.name}:${p.songs.length}:${p.status || ''}`).join('|')}`;
  if (signature !== state.collectionSignature) {
    state.collectionSignature = signature;
    ui.importedTabs.innerHTML = playlists.map((playlist) => `<button id="tab-${escapeHTML(playlist.id)}" class="collection-link tab" type="button" role="tab" aria-controls="song-list" data-view="${escapeHTML(playlist.id)}"><span class="collection-link-icon" aria-hidden="true">♫</span><span>${escapeHTML(playlist.name)}</span><span class="tab-count">${playlist.songs.length}</span></button>`).join('');
    ui.tabs = [...document.querySelectorAll('#collection-tabs .tab, #imported-playlist-tabs .tab')];
    $('#mobile-collection-nav').innerHTML = `<span class="mobile-context-label">YOUR LIBRARY</span><button class="mobile-collection-link" type="button" data-view="all">All MEGA Songs <span>${state.songs.length}</span></button>${playlists.map((playlist) => `<button class="mobile-collection-link" type="button" data-view="${escapeHTML(playlist.id)}">${escapeHTML(playlist.name)} <span>${playlist.songs.length}</span></button>`).join('')}`;
    ui.importedMega.innerHTML = playlists.map((playlist) => {
      const isMega = state.megaPlaylists.includes(playlist);
      const type = isMega ? 'MEGA' : playlist.source === 'Queue snapshot' ? 'Queue' : 'Device';
      const source = isMega ? playlist.source || playlist.url || 'MEGA folder' : playlist.fileName || 'Device playlist';
      const remove = isMega ? `<button type="button" class="text-button danger-text" data-remove-mega="${escapeHTML(playlist.id)}" aria-label="Remove ${escapeHTML(playlist.name)} from Collection">Remove</button>` : '';
      return `<div class="imported-playlist"><span>${escapeHTML(playlist.name)}</span><small>${type} · ${playlist.songs.length} tracks · ${escapeHTML(source)}</small><span class="imported-playlist-actions"><button type="button" class="text-button" data-open-playlist="${escapeHTML(playlist.id)}" aria-label="Open ${escapeHTML(playlist.name)}">Open</button>${remove}</span></div>`;
    }).join('') || '<div class="imported-playlist-empty">No playlists imported yet.</div>';
  }
  $('#tab-all').classList.toggle('active', state.view === 'all'); $('#tab-all').setAttribute('aria-selected', String(state.view === 'all'));
  for (const button of ui.importedTabs.querySelectorAll?.('[data-view]') || []) { const active = button.dataset.view === state.view; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); }
  for (const button of $('#mobile-collection-nav').querySelectorAll?.('[data-view]') || []) button.classList.toggle('active', button.dataset.view === state.view);
}
function renderRows() {
  const source = collectionSource();
  const deviceSource = state.devicePlaylists.find((playlist) => playlist.id === state.view);
  const megaSource = state.megaPlaylists.find((playlist) => playlist.id === state.view);
  ui.summary.hidden = !(deviceSource || megaSource);
  if (deviceSource) {
    ui.summary.textContent = devicePlaylistSummaryText(deviceSource);
    ui.unmatched.hidden = !deviceSource.unmatched.length;
    ui.unmatched.innerHTML = deviceSource.unmatched.length ? `<strong>${deviceSource.unmatched.length} unresolved or ambiguous entries:</strong>${deviceSource.unmatched.map(escapeHTML).join('<br>')}<br>Select “Match local audio” to resolve local paths.` : '';
  } else if (megaSource) {
    ui.summary.textContent = `MEGA playlist · ${megaSource.name} · ${megaSource.songs.length} supported audio files · Status: ${megaSource.status} · Source: ${megaSource.url}`;
    const unmatched = megaSource.unmatched || [];
    ui.unmatched.hidden = !unmatched.length;
    ui.unmatched.innerHTML = unmatched.length ? `<strong>${unmatched.length} playlist ${unmatched.length === 1 ? 'entry was' : 'entries were'} not found in All MEGA Songs:</strong>${unmatched.map(escapeHTML).join('<br>')}` : '';
  } else { ui.unmatched.hidden = true; }
  ui.list.setAttribute('aria-labelledby', state.view === 'all' ? 'tab-all' : `tab-${state.view}`);
  ui.list.classList.toggle('edit-mode', state.editMode);
  ui.count.textContent = `${source.length} ${source.length === 1 ? 'track' : 'tracks'}`;
  ui.allBadge.textContent = String(state.songs.length);
  if (state.page === 'library') {
    ui.list.innerHTML = renderSongRows(source, true);
    indexSongRows(ui.list);
    state.renderedList = ui.list;
  }
  ui.queueAll.disabled = source.length === 0;
  ui.queuePagePlayAll.disabled = source.length === 0;
  const playlistSelected = Boolean(deviceSource || megaSource);
  $('#playlist-empty').hidden = playlistSelected;
  $('#playlist-detail').hidden = !playlistSelected;
  $('#playlist-detail-title').textContent = (deviceSource || megaSource)?.name || 'Playlist';
  $('#playlist-detail-source').textContent = deviceSource ? 'DEVICE PLAYLIST' : 'MEGA PLAYLIST';
  $('#playlist-detail-count').textContent = `${source.length} ${source.length === 1 ? 'track' : 'tracks'}`;
  if (state.page === 'playlists' && playlistSelected) {
    ui.playlistSongList.innerHTML = renderSongRows(source, false);
    indexSongRows(ui.playlistSongList);
    state.renderedList = ui.playlistSongList;
  }
  updatePlaylistCount();
  renderHomeDashboard();
  renderCollectionTabs();
  ui.edit.hidden = state.view === 'all' || !source.length;
  ui.save.hidden = state.view === 'all' || !source.length;
  ui.clear.hidden = !state.view.startsWith('device-');
  ui.edit.textContent = state.editMode ? 'Done editing' : 'Edit Playlist';
  ui.queueStart.disabled = upcomingQueue().length === 0;
  if (state.page === 'queue') renderQueue();
  updateNextPreloadIndicator();
}
function renderSongRows(songs, allowSearch = true) {
  const rows = allowSearch ? visibleSongs() : songs;
  if (!rows.length) {
    const query = allowSearch && ui.search.value;
    return `<div class="empty-state"><span class="empty-icon">♫</span><strong>${songs.length ? 'No matches found' : 'Your library is waiting'}</strong><span>${songs.length ? 'Try another title or folder name.' : 'Connect a MEGA folder to discover your music.'}</span></div>`;
  }
  return rows.map((song, index) => {
    const current = state.currentId === song.id;
    const failed = state.failed.has(song.id);
    const label = failed ? '!' : (current && !ui.audio.paused ? '♫' : (current ? 'Ⅱ' : '▶'));
    const stateClass = failed ? 'failed' : (current ? 'ready' : '');
    const duration = song.durationHint ? formatTime(song.durationHint) : '—';
    return `<div class="song-row${current ? ' current' : ''}" data-song-id="${escapeHTML(song.id)}" data-row-index="${index}" draggable="${state.editMode}"><span class="song-num">${current ? '♪' : String(index + 1).padStart(2,'0')}</span><button class="song-main song-play" type="button" data-action="play" aria-label="Play ${escapeHTML(song.name)}"><span class="song-name">${escapeHTML(song.name)}</span><span class="song-path">${escapeHTML(song.path)}${song.size ? ` · Size ${escapeHTML(formatSize(song.size))}` : ''}</span></button><span class="song-size" title="Length">${duration}</span><button class="song-state ${stateClass}" type="button" data-action="play" aria-label="Play ${escapeHTML(song.name)}">${label}</button><button class="row-action" type="button" data-action="play-next" aria-label="Play next: ${escapeHTML(song.name)}">+ Next</button>${state.editMode ? `<button class="row-action" type="button" data-action="move-up" aria-label="Move ${escapeHTML(song.name)} up">↑</button><button class="row-action" type="button" data-action="move-down" aria-label="Move ${escapeHTML(song.name)} down">↓</button><button class="row-action" type="button" data-action="remove-entry" aria-label="Remove ${escapeHTML(song.name)} from playlist">×</button>` : ''}</div>`;
  }).join('');
}
function indexSongRows(list) {
  state.songRowNodes.clear();
  for (const row of list.querySelectorAll?.('.song-row[data-song-id]') || []) {
    const id = row.dataset.songId;
    if (!state.songRowNodes.has(id)) state.songRowNodes.set(id, []);
    state.songRowNodes.get(id).push(row);
  }
}
function updateSongRowState(id) {
  if (!id) return;
  const rows = state.songRowNodes.get(id) || [];
  const current = state.currentId === id;
  for (const row of rows) {
    row.classList.toggle('current', current);
    const number = row.querySelector('.song-num');
    if (number) number.textContent = current ? '♪' : String(Number(row.dataset.rowIndex) + 1).padStart(2, '0');
    const button = row.querySelector('.song-state');
    if (button) { const failed = state.failed.has(id); button.textContent = failed ? '!' : current && !ui.audio.paused ? '♫' : current ? 'Ⅱ' : '▶'; button.classList.toggle('failed', failed); button.classList.toggle('ready', current && !failed); }
    const duration = row.querySelector('.song-size');
    if (duration && state.currentSong?.id === id && state.currentSong.durationHint) duration.textContent = formatTime(state.currentSong.durationHint);
  }
}
function renderQueue() {
  const upcoming = upcomingQueue();
  const current = state.currentSong;
  const progress = state.downloadProgress?.songId === state.currentId ? state.downloadProgress : null;
  ui.queueCurrent.innerHTML = current ? `<span class="queue-current-art" aria-hidden="true">♫</span><div class="queue-current-info"><strong id="queue-current-heading" title="${escapeHTML(current.name)}">${escapeHTML(current.name)}</strong><small>${escapeHTML(current.path || '')}</small><div class="queue-download-progress${progress?.indeterminate ? ' indeterminate' : ''}" id="queue-download-progress" role="progressbar" aria-label="Current song download progress" aria-valuemin="0" aria-valuemax="100"${progress && !progress.indeterminate ? ` aria-valuenow="${progress.percent}"` : ''}><span id="queue-download-fill" style="width:${progress?.percent ?? 0}%"></span></div><small class="queue-download-label" id="queue-download-label">${escapeHTML(progress?.label || 'Audio ready · 100%')}</small></div>` : '<span class="queue-current-art" aria-hidden="true">♫</span><div class="queue-current-info"><strong id="queue-current-heading">Nothing playing yet</strong><small>Start a track from your library.</small></div>';
  updateQueueCounts();
  ui.queueStart.disabled = upcoming.length === 0;
  const queueSignature = upcoming.map((song) => `${song.id}:${state.prioritized.has(song.id) ? 1 : 0}:${state.preload?.id === song.id && state.preload.ready ? 1 : 0}`).join('|');
  if (queueSignature === state.queueRenderSignature) return;
  state.queueRenderSignature = queueSignature;
  if (!upcoming.length) {
    ui.queue.innerHTML = '<div class="queue-empty"><span>♫</span>Tracks you play will find their place here.</div>';
    return;
  }
  reconcileQueueRows(upcoming);
}
function updateQueueDownloadProgress(song, received, total, phase = 'Downloading') {
  if (!song || state.currentId !== song.id) return;
  const knownTotal = Math.max(0, Number(total) || 0);
  const percent = phase === 'Audio ready' ? 100 : knownTotal ? Math.max(0, Math.min(99, Math.floor(received / knownTotal * 100))) : 0;
  const label = knownTotal ? `${phase} · ${percent}% · ${formatSize(received)} / ${formatSize(knownTotal)}` : `${phase} · ${formatSize(received)} downloaded`;
  state.downloadProgress = {songId:song.id, percent, received, total:knownTotal, label, indeterminate:!knownTotal};
  const progress = ui.queueCurrent.querySelector?.('#queue-download-progress'), fill = ui.queueCurrent.querySelector?.('#queue-download-fill'), text = ui.queueCurrent.querySelector?.('#queue-download-label');
  if (progress && fill && text) {
    fill.style.width = `${percent}%`; progress.classList.toggle('indeterminate', !knownTotal);
    if (knownTotal) progress.setAttribute('aria-valuenow', String(percent)); else progress.removeAttribute('aria-valuenow');
    text.textContent = label;
  }
}
function moveQueueSong(id, direction) {
  const queue = upcomingQueue(); const index = queue.findIndex((song) => song.id === id); const target = index + direction;
  if (index < 0 || target < 0 || target >= queue.length) return;
  [queue[index], queue[target]] = [queue[target], queue[index]];
  state.queue = [...queue];
  applyQueueChange();
}
function reorderQueueSong(fromId, toId) {
  if (fromId === toId) return;
  const queue = upcomingQueue(); const from = queue.findIndex((song) => song.id === fromId); const to = queue.findIndex((song) => song.id === toId);
  if (from < 0 || to < 0) return;
  const [song] = queue.splice(from, 1); queue.splice(to, 0, song); state.queue = [...queue]; applyQueueChange();
}
function parseMegaFolderUrl(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('Enter a valid MEGA folder URL.'); }
  if (!['mega.nz','www.mega.nz','mega.co.nz','www.mega.co.nz'].includes(url.hostname.toLowerCase())) throw new Error('Use a public link from mega.nz or mega.co.nz.');
  const path = url.pathname;
  const fragment = decodeURIComponent(url.hash.replace(/^#/, ''));
  let id = '', key = '';
  const modern = path.match(/^\/(?:folder|#F!)\/([^/]+)/i) || path.match(/^\/folder\/([^/]+)/i);
  if (modern) { id = modern[1]; key = fragment.split(/[!?]/).filter(Boolean).pop() || ''; }
  else {
    const legacy = fragment.match(/^F!?([^!]+)!([^!]+)$/i);
    if (legacy) [, id, key] = legacy;
    else {
      const legacyPath = path.match(/#F!?([^!]+)!([^!]+)/i);
      if (legacyPath) [, id, key] = legacyPath;
    }
  }
  if (!id || !key || !/^[A-Za-z0-9_-]+$/.test(id) || !/^[A-Za-z0-9_-]+$/.test(key)) throw new Error('This does not look like a complete public folder link. Include the key after #.');
  return `https://mega.nz/folder/${id}#${key}`;
}
async function loadFolder(event) {
  event?.preventDefault();
  if (state.loading) return;
  let normalizedUrl;
  try { normalizedUrl = parseMegaFolderUrl(ui.url.value); }
  catch (error) { setStatus(error.message, 'error'); return; }
  state.loading = true;
  const token = ++state.loadToken;
  ui.load.disabled = true;
  ui.load.querySelector('.button-text').textContent = 'Loading…';
  setStatus(state.MegaFile ? 'Connecting to the public folder…' : 'Loading the MEGA browser client…', 'loading');
  ui.connection.textContent = 'Connecting';
  ui.dot.classList.remove('connected');
  setFolderProgress(true, 8, 'Opening public folder…');
  console.info('[Orbit] Loading shared folder', normalizedUrl.replace(/#.+$/, '#[key hidden]'));
  try {
    await loadMegaClient();
    const folder = state.MegaFile.fromURL(normalizedUrl);
    if (!folder || typeof folder.loadAttributes !== 'function') throw new Error('The MEGA client could not create a folder handle.');
    folder.api.userAgent = null;
    await folder.loadAttributes();
    if (token !== state.loadToken) return;
    if (!folder.directory) throw new Error('This is a MEGA file link. Please enter a shared folder link.');
    setFolderProgress(true, 48, 'Reading folder contents…');
    if (!Array.isArray(folder.children)) throw new Error('The folder contents were not available. Check that the share is public.');
    const songs = (await walkFolder(folder)).sort((a,b) => a.path.localeCompare(b.path, undefined, {numeric:true, sensitivity:'base'}));
    if (token !== state.loadToken) return;
    state.root = folder;
    state.rootUrl = normalizedUrl;
    state.songs = songs;
    state.playlist = null;
    state.unmatched = [];
    state.failed.clear();
    ui.file.value = '';
    ui.clear.hidden = true;
    ui.summary.hidden = true;
    ui.unmatched.hidden = true;
    ui.search.value = '';
    ui.tabs.forEach(tab => { const selected = tab.dataset.view === 'all'; tab.classList.toggle('active', selected); tab.setAttribute('aria-selected', String(selected)); });
    state.view = 'all';
    ui.connection.textContent = 'MEGA connected';
    ui.dot.classList.add('connected');
    ui.footer.textContent = `${songs.length} audio ${songs.length === 1 ? 'track' : 'tracks'} found`;
    ui.updated.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    setFolderProgress(true, 100, `${songs.length} audio ${songs.length === 1 ? 'track' : 'tracks'} discovered`);
    setStatus(songs.length ? `Folder loaded. ${songs.length} supported audio ${songs.length === 1 ? 'file is' : 'files are'} ready to download on selection.` : 'Folder loaded, but no supported audio files were found.', songs.length ? 'success' : '');
    console.info(`[Orbit] Folder loaded: ${folder.children.length} top-level items, ${songs.length} supported audio files.`);
    renderRows();
  } catch (error) {
    console.error('[Orbit] Folder loading failed:', error);
    const detail = error.message || 'Unknown MEGA error';
    const friendly = /dynamically imported module|failed to fetch|fetch failed/i.test(detail)
      ? 'Could not load the MEGA client from unpkg. Check network/CDN access, then press Load folder to retry.'
      : /ENOENT|wrong password/i.test(detail)
      ? 'MEGA could not find this folder. Check that it is still shared and that the decryption key after # is correct.'
      : `Could not load the folder. Check that it is public and try again. MEGA: ${detail}`;
    setStatus(friendly, 'error');
    ui.connection.textContent = state.root ? 'Previous folder loaded' : 'Not connected';
    ui.dot.classList.toggle('connected', Boolean(state.root));
    setFolderProgress(false);
  } finally {
    if (token === state.loadToken) {
      state.loading = false;
      ui.load.disabled = false;
      ui.load.querySelector('.button-text').textContent = 'Load folder';
    }
  }
}
function parseM3U(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries = [];
  let extinf = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/^#EXTINF:([+-]?(?:\d+(?:\.\d+)?|-1))(?:\s*,\s*(.*))?$/i);
      extinf = match ? { duration: Number(match[1]), title: match[2]?.trim() || '' } : { duration: null, title: '' };
      continue;
    }
    if (line.startsWith('#')) continue;
    entries.push({ path: normalPath(line), metadata: extinf });
    extinf = null;
  }
  return entries;
}
function allMatchableSongs() { return [...state.songs, ...state.megaPlaylists.flatMap((playlist) => playlist.songs)]; }
function matchPlaylist(entries, songs, localFiles = []) {
  const matched = [], unmatched = [];
  for (const [index, entry] of entries.entries()) {
    const path = normalizedMatch(entry.path), basename = normalizedMatch(entry.path.split('/').pop() || entry.path);
    const pathMatches = songs.filter((song) => normalizedMatch(song.path) === path);
    let song = pathMatches.length === 1 ? pathMatches[0] : null;
    if (!song) { const nameMatches = songs.filter((item) => normalizedMatch(item.name) === basename); if (nameMatches.length === 1) song = nameMatches[0]; }
    if (!song) {
      const exactFiles = localFiles.filter((item) => item.webkitRelativePath && normalizedMatch(item.webkitRelativePath) === path);
      const localMatches = exactFiles.length ? exactFiles : localFiles.filter((item) => normalizedMatch(item.name) === basename);
      if (localMatches.length === 1) song = { id: `local:${localMatches[0].webkitRelativePath || localMatches[0].name}:${localMatches[0].size}:${localMatches[0].lastModified}`, name: localMatches[0].name, path: localMatches[0].webkitRelativePath || localMatches[0].name, size: localMatches[0].size, blob: localMatches[0], source: 'device' };
    }
    if (!song && /^https?:\/\//i.test(entry.path)) song = { id: `url:${entry.path}`, name: entry.metadata?.title || entry.path.split('/').pop() || entry.path, path: entry.path, url: entry.path, source: 'url' };
    if (song) matched.push({ ...song, id: `${song.id}:entry:${index}`, originalId: song.id, durationHint: entry.metadata?.duration > 0 ? entry.metadata.duration : song.durationHint || null, playlistTitle: entry.metadata?.title || song.playlistTitle || '', playlistPath: entry.path });
    else unmatched.push(entry.path);
  }
  return { matched, unmatched };
}
async function importPlaylist(file) {
  if (!file) return;
  if (!/\.m3u8?$/i.test(file.name)) { setStatus('Choose a .m3u or .m3u8 playlist file.', 'error'); ui.file.value = ''; return; }
  try {
    const entries = parseM3U(await file.text()), result = matchPlaylist(entries, allMatchableSongs());
    const devicePlaylist = { id: `device-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, name: file.name.replace(/\.m3u8?$/i, ''), fileName: file.name, entries, songs: result.matched, unmatched: result.unmatched, dirty: false, source: 'Device M3U' };
    state.devicePlaylists.push(devicePlaylist); state.view = devicePlaylist.id; state.page = 'playlists'; state.editMode = false; ui.summary.hidden = false;
    ui.summary.textContent = `Device playlist · ${file.name} · ${result.matched.length} supported/matched of ${entries.length} entries. Local files are not uploaded; paths the browser cannot resolve are shown below.`;
    state.unmatched = result.unmatched; ui.unmatched.hidden = !result.unmatched.length;
    ui.unmatched.innerHTML = result.unmatched.length ? `<strong>${result.unmatched.length} unresolved or ambiguous entries:</strong>${result.unmatched.map(escapeHTML).join('<br>')}<br>Select “Match local audio” to resolve local paths.` : '';
    setPage('playlists'); setStatus(`${file.name} imported from this device: ${result.matched.length} tracks${result.unmatched.length ? `, ${result.unmatched.length} unresolved` : ''}.`, result.matched.length ? 'success' : 'error'); renderRows();
  } catch (error) { console.error('[Orbit] Playlist parsing failed:', error); setStatus(`Could not read this playlist: ${error.message}`, 'error'); }
  finally { ui.file.value = ''; }
}
function matchLocalAudio(files) {
  const playlist = state.devicePlaylists.find((item) => item.id === state.view);
  if (!files?.length || !playlist) { setStatus('Open a device M3U/M3U8 playlist first, then select its audio files.', 'error'); return; }
  const result = matchPlaylist(playlist.entries, allMatchableSongs(), [...files]);
  playlist.songs = result.matched; playlist.unmatched = result.unmatched; playlist.dirty = true;
  state.unmatched = result.unmatched; ui.unmatched.hidden = !result.unmatched.length;
  ui.unmatched.innerHTML = result.unmatched.length ? `<strong>${result.unmatched.length} entries could not be resolved:</strong>${result.unmatched.map(escapeHTML).join('<br>')}` : '';
  setStatus(`Matched ${result.matched.length} entries to MEGA tracks or local audio. Local files remain on this device.`, 'success'); renderRows();
}
async function previewMegaPlaylist() {
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    ui.megaPreview.textContent = 'MEGA cannot reliably read shared folders from a file:// page. Open this player from localhost or its HTTPS site, then choose Find playlists again.';
    return;
  }
  let url; try { url = parseMegaFolderUrl(ui.importUrl.value); } catch (error) { ui.megaPreview.textContent = error.message; return; }
  const identity = url.match(/\/folder\/([^#]+)/)?.[1];
  ui.playlistChoices.innerHTML = ''; ui.megaPreview.textContent = 'Reading the folder and discovering playlists…'; ui.previewMega.disabled = true;
  try {
    const MegaFile = await loadMegaClient(), folder = MegaFile.fromURL(url); folder.api.userAgent = null; await folder.loadAttributes();
    if (!folder.directory || !Array.isArray(folder.children)) throw new Error('This MEGA link is not an accessible public folder.');
    if (!folder.children.length) throw new Error('MEGA returned an empty folder listing. Check that the public link still contains items, then retry.');
    const groups = [];
    const rootSongs = (await walkFolder(folder, [], [], `mega-${identity}`)).sort((a,b) => a.path.localeCompare(b.path, undefined, {numeric:true,sensitivity:'base'}));
    const playlistFiles = await findMegaPlaylistFiles(folder);
    const playlistFolderPaths = new Set();
    for (const { path } of playlistFiles) {
      const parts = path.split('/');
      for (let depth = 1; depth < parts.length; depth++) playlistFolderPaths.add(parts.slice(0, depth).join('/'));
    }
    const rootAudio = folder.children.filter((child) => !child.directory && AUDIO_EXTENSIONS.has(extOf(child.name)));
    if (rootAudio.length) {
      const directSongs = rootSongs.filter((song) => !song.path.includes('/'));
      groups.push({ folder, songs: directSongs, name: `${folder.name || 'MEGA folder'} (root tracks)`, identity: `${identity}:root`, kind:'folder' });
    }
    for (const [index, child] of folder.children.entries()) {
      const childIdentity = `${identity}:${child.nodeId || `${child.name}:${index}`}`;
      if (child.directory) {
        const childSongs = await walkFolder(child, [child.name], [], `mega-${childIdentity}`);
        if (childSongs.length || !playlistFolderPaths.has(child.name)) groups.push({ folder:child, songs:childSongs.sort((a,b) => a.path.localeCompare(b.path, undefined, {numeric:true,sensitivity:'base'})), name:child.name || `Playlist folder ${index + 1}`, identity:childIdentity, kind:'folder' });
      }
    }
    for (const [index, item] of playlistFiles.entries()) {
      const child = item.file;
      const childIdentity = `${identity}:${child.nodeId || `${item.path}:${index}`}`;
      try {
        const bytes = await downloadMegaTextBytes(child);
        let playlistText;
        try { playlistText = new TextDecoder('utf-8', { fatal:true }).decode(bytes); }
        catch { playlistText = new TextDecoder('windows-1252').decode(bytes); }
        const entries = parseM3U(playlistText);
        // Resolve imported MEGA M3U entries against the main All MEGA Songs
        // collection only. Copies beside the playlist must not inflate counts.
        const result = matchPlaylist(entries, state.songs);
        const matched = result.matched.map((song) => ({ ...song, id:`mega-${childIdentity}:${song.id}`, originalId:song.id, source:`mega-${childIdentity}` }));
        groups.push({ folder:child, songs:matched, unmatched:result.unmatched, entries, name:item.path.replace(/\.m3u8?$/i,''), identity:childIdentity, kind:'m3u', entryCount:entries.length });
      } catch (error) { groups.push({ folder:child, songs:[], entries:[], name:item.path, identity:childIdentity, kind:'m3u', entryCount:0, error:error.message }); }
    }
    if (!groups.length && rootSongs.length) groups.push({ folder, songs:rootSongs, name:folder.name || `MEGA folder ${identity}`, identity:`${identity}:root`, kind:'folder' });
    state.pendingImport = { url, identity, folder, groups, name: folder.name || `MEGA folder ${identity}` };
    if (!groups.length) {
      const names = folder.children.map((item) => `${item.directory ? 'Folder' : 'File'}: ${item.name || '(unnamed)'}`).join(' · ');
      ui.megaPreview.textContent = `Read ${folder.children.length} items in ${state.pendingImport.name}, but found no audio folders or M3U/M3U8 playlists. Contents: ${names}`;
      return;
    }
    ui.megaPreview.textContent = `Found ${groups.length} available playlist${groups.length === 1 ? '' : 's'} in ${state.pendingImport.name}. Review each name and track count, then import the playlists you want.`;
    renderMegaPlaylistChoices();
  } catch (error) { state.pendingImport = null; ui.megaPreview.textContent = `Could not read this MEGA folder: ${error.message}. Try again or use another public folder link.`; }
  finally { ui.previewMega.disabled = false; }
}
function chooseMegaPlaylist(index) {
  const group = state.pendingImport?.groups?.[Number(index)]; if (!group) return;
  if (state.megaPlaylists.some((item) => item.identity === group.identity)) return;
  const baseId = `mega-${group.identity}`;
  let id = baseId, suffix = 2;
  while (state.megaPlaylists.some((item) => item.id === id) || state.devicePlaylists.some((item) => item.id === id)) id = `${baseId}-${suffix++}`;
  state.megaPlaylists.push({ ...group, id, status:group.songs.length ? 'loaded' : group.error ? 'error' : 'empty', source:state.pendingImport.url });
  state.view = id;
  ui.megaPreview.textContent = group.kind === 'm3u'
    ? `${group.name} imported · ${group.songs.length} matched songs from ${group.entryCount} playlist entries.`
    : `${group.name} imported · ${group.songs.length} supported audio files.`;
  setPage('playlists'); setStatus(`Imported ${group.name} with ${group.songs.length} tracks.`, group.songs.length ? 'success' : 'error'); renderRows();
  // Keep the discovery list visible and update button availability without rescanning MEGA.
  renderMegaPlaylistChoices();
}
function removeMegaPlaylist(id) {
  const playlist = state.megaPlaylists.find((item) => item.id === id); if (!playlist) return;
  state.megaPlaylists = state.megaPlaylists.filter((item) => item.id !== id); if (state.view === id) state.view = 'all';
  const removedIds = new Set(playlist.songs.map((song) => song.id)); state.queue = state.queue.filter((song) => !removedIds.has(song.id)); playlist.songs.forEach((song) => state.prioritized.delete(song.id));
  applyQueueChange();
  if (state.currentSong?.source === id) stopPlayback();
  ui.megaPreview.textContent = `${playlist.name} removed from this Collection. Nothing was deleted from MEGA.`; renderMegaPlaylistChoices(); renderRows();
}
function clearPlaylist() {
  if (state.view.startsWith('device-')) {
    const playlist = state.devicePlaylists.find((item) => item.id === state.view);
    if (playlist) {
      const ids = new Set(playlist.songs.map((song) => song.id));
      if (state.currentId && ids.has(state.currentId)) stopPlayback();
      state.queue = state.queue.filter((song) => !ids.has(song.id)); playlist.songs.forEach((song) => state.prioritized.delete(song.id));
      state.devicePlaylists = state.devicePlaylists.filter((item) => item.id !== state.view);
    }
    state.view = 'all'; applyQueueChange();
  }
  state.unmatched = []; ui.summary.hidden = true; ui.unmatched.hidden = true; renderRows();
}
function revokeCurrentUrl() {
  if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
  state.currentUrl = null;
  if (state.artUrl) URL.revokeObjectURL(state.artUrl);
  state.artUrl = null;
  if (ui.cover) { ui.cover.hidden = true; ui.cover.removeAttribute('src'); }
  ui.albumArt?.classList.remove('cover-active');
  ui.audio.removeAttribute('src');
  ui.audio.load();
}
function collectStream(stream, song, isCurrent = () => false, onProgress = null) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let settled = false;
    const cleanup = () => {
      stream.removeListener?.('data', onData);
      stream.removeListener?.('end', onEnd);
      stream.removeListener?.('error', onError);
    };
    const fail = (error, destroy = true) => { if (settled) return; settled = true; cleanup(); if (destroy) stream.destroy?.(); reject(error); };
    const onData = (chunk) => {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      received += bytes.byteLength;
      if (received > MAX_TRACK_BYTES) {
        stream.destroy?.();
        return fail(new Error(`This track exceeds the ${formatSize(MAX_TRACK_BYTES)} in-browser playback limit. Use the MEGA website to download it, or choose a smaller file.`));
      }
      chunks.push(bytes);
      const total = Number(song.size) || Number(stream.bytesTotal) || 0;
      const percent = total ? Math.min(90, Math.round(received / total * 90)) : 10;
      onProgress?.(received, total);
      if (isCurrent()) {
        setFolderProgress(true, percent, `Downloading and decrypting ${song.name} · ${formatSize(received)}${total ? ` / ${formatSize(total)}` : ''}`);
        updateQueueDownloadProgress(song, received, total, 'Downloading');
      }
    };
    const onEnd = () => {
      if (settled) return;
      settled = true; cleanup();
      if (!received) return reject(new Error('MEGA returned an empty audio file.'));
      resolve(new Blob(chunks, {type: mimeFor(song.name)}));
    };
    const onError = (error) => fail(error, false);
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onError);
  });
}
function getSongBlob(song, purpose = 'playback') {
  if (song.blob instanceof Blob) return Promise.resolve(song.blob);
  if (song.url) return fetch(song.url).then((response) => { if (!response.ok) throw new Error(`Download failed (${response.status}).`); return response.blob(); });
  if (state.downloadCache.has(song.id)) return Promise.resolve(state.downloadCache.get(song.id));
  const existing = state.downloadPromises.get(song.id);
  if (existing) { if (purpose === 'playback') existing.purpose = 'playback'; return existing.promise; }
  const entry = { purpose, stream: null, cancelled: false, promise: null };
  entry.promise = (async () => {
    if (!Number.isFinite(song.size) || song.size <= 0) await song.file.loadAttributes();
    if ((!Number.isFinite(song.size) || song.size <= 0) && Number(song.file.size) > 0) song.size = Number(song.file.size);
    if (entry.purpose === 'preload' && state.preload?.id === song.id && Number(song.size) > 0) state.preload.total = Number(song.size);
    if (entry.cancelled) throw new Error('Preload cancelled.');
    if (song.file.size > MAX_TRACK_BYTES) throw new Error(`This track is ${formatSize(song.file.size)}. The current browser limit is ${formatSize(MAX_TRACK_BYTES)} to protect memory.`);
    const stream = song.file.download({forceHttps:true}); entry.stream = stream;
    if (entry.purpose === 'preload' && state.preload?.id === song.id) { state.preload.status = 'downloading'; state.preload.stream = stream; updateNextPreloadIndicator(); }
    if (purpose === 'playback') state.activeDownloadStream = stream;
    const blob = await collectStream(stream, song, () => entry.purpose === 'playback' && state.currentId === song.id, (received, total) => {
      if (entry.purpose === 'preload' && state.preload?.id === song.id) {
        const record = state.preload; record.status = 'downloading'; record.received = received; record.total = total;
        record.percent = total > 0 ? Math.max(0, Math.min(99, Math.floor(received / total * 100))) : null;
        updateNextPreloadIndicator();
      }
    });
    if (entry.cancelled) throw new Error('Preload cancelled.');
    state.downloadCache.set(song.id, blob);
    return blob;
  })().finally(() => {
    if (state.downloadPromises.get(song.id) === entry) state.downloadPromises.delete(song.id);
    if (state.activeDownloadStream === entry.stream) state.activeDownloadStream = null;
  });
  state.downloadPromises.set(song.id, entry);
  return entry.promise;
}
function mimeFor(name) {
  const map = {mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',wav:'audio/wav',flac:'audio/flac',weba:'audio/webm',webm:'audio/webm',aif:'audio/aiff',aiff:'audio/aiff',mid:'audio/midi',midi:'audio/midi', '3gp':'audio/3gpp'};
  return map[extOf(name)] || 'application/octet-stream';
}
function coverNodeFor(song) {
  const root = song.source === 'main' ? state.root : state.megaPlaylists.find((playlist) => playlist.id === song.source)?.folder;
  if (!root) return null;
  const directories = song.path.split('/').slice(0, -1); let folder = root, best = null;
  for (let depth = 0; folder && depth <= directories.length; depth++) {
    const images = (folder.children || []).filter((node) => !node.directory && /^(cover|folder|album)\.(jpe?g|png|webp)$/i.test(node.name));
    if (images.length) best = images.sort((a,b) => ['cover','folder','album'].indexOf(a.name.split('.')[0].toLowerCase()) - ['cover','folder','album'].indexOf(b.name.split('.')[0].toLowerCase()))[0];
    if (depth < directories.length) folder = (folder.children || []).find((node) => node.directory && node.name === directories[depth]);
  }
  return best;
}
async function loadCover(song, token) {
  const cover = coverNodeFor(song); if (!cover || (Number(cover.size) > 5 * 1024 * 1024)) return;
  try {
    const raw = await collectStream(cover.download({forceHttps:true}), {name:cover.name,size:Number(cover.size)||0}, () => false);
    if (token !== state.playToken || state.currentId !== song.id) return;
    if (state.artUrl) URL.revokeObjectURL(state.artUrl);
    const type = /\.png$/i.test(cover.name) ? 'image/png' : /\.webp$/i.test(cover.name) ? 'image/webp' : 'image/jpeg';
    state.artUrl = URL.createObjectURL(new Blob([raw], {type})); ui.cover.src = state.artUrl; ui.cover.hidden = false; ui.albumArt.classList.add('cover-active');
  } catch (error) { console.info('[Orbit] Cover image unavailable:', error.message); }
}
async function playSong(song, autoplay = true, options = {}) {
  if (!song) return;
  const previousCurrentId = state.currentId;
  if (!options.preserveQueue && state.currentSong && state.currentId !== song.id) { state.history.push(state.currentSong); if (state.history.length > 100) state.history.shift(); }
  if (state.currentId && state.currentId !== song.id) state.downloadCache.delete(state.currentId);
  const previousDownload = state.currentId && state.downloadPromises.get(state.currentId);
  if (previousDownload?.purpose === 'playback' && state.currentId !== song.id) { previousDownload.cancelled = true; state.downloadPromises.delete(state.currentId); previousDownload.stream?.destroy?.(); }
  const source = options.source || collectionSource();
  if (!options.preserveQueue) setPlaybackSource(song, source);
  else state.queue = state.queue.filter((item) => item.id !== song.id);
  state.preloadGeneration++;
  if (state.preload?.id === song.id) { const task = state.downloadPromises.get(song.id); if (task) task.purpose = 'playback'; state.preload = null; }
  else cancelPreload();
  const token = ++state.playToken;
  state.currentId = song.id; state.currentSong = song; state.failed.delete(song.id);
  updateSongRowState(previousCurrentId);
  updateQueueCounts();
  state.downloadProgress = {songId:song.id, percent:0, received:0, total:Number(song.size)||0, label:'Starting audio download…', indeterminate:!(Number(song.size)>0)};
  if (state.artUrl) URL.revokeObjectURL(state.artUrl); state.artUrl = null; ui.cover.hidden = true; ui.cover.removeAttribute('src'); ui.albumArt.classList.remove('cover-active');
  ui.nowTitle.textContent = song.playlistTitle || song.name; updateNowTitleScroll(); ui.nowFolder.textContent = `${song.source || 'MEGA'} · ${song.path}${song.size ? ` · Size ${formatSize(song.size)}` : ''}`;
  ui.play.disabled = true; ui.download.disabled = false; ui.previous.disabled = state.history.length === 0; ui.next.disabled = state.queue.length === 0;
  ui.seek.disabled = true; ui.seek.value = '0'; ui.current.textContent = '0:00'; ui.total.textContent = song.durationHint ? formatTime(song.durationHint) : '—';
  ui.bars.classList.remove('active'); setPlayerMessage(`Preparing ${song.name}…`); setFolderProgress(true, 0, `Starting download · ${song.name}`);
  revokeCurrentUrl(); updateSongRowState(song.id);
  if (state.page === 'queue') renderQueue();
  updateNextPreloadIndicator();
  try {
    const blob = await getSongBlob(song, 'playback');
    if (token !== state.playToken) return;
    if (!blob.size) throw new Error('The downloaded audio file is empty.');
    updateQueueDownloadProgress(song, blob.size, Number(song.size) || blob.size, 'Audio ready');
    loadCover(song, token);
    state.currentUrl = URL.createObjectURL(blob); ui.audio.src = state.currentUrl; ui.audio.load();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The browser did not recognize this audio format. Try another file or a browser-supported format.')), 15000);
      const onReady = () => { clearTimeout(timeout); cleanup(); resolve(); };
      const onFail = () => { clearTimeout(timeout); cleanup(); reject(new Error('The browser could not decode this audio. The file may use an unsupported codec.')); };
      const cleanup = () => { ui.audio.removeEventListener('canplay', onReady); ui.audio.removeEventListener('error', onFail); };
      ui.audio.addEventListener('canplay', onReady, {once:true}); ui.audio.addEventListener('error', onFail, {once:true});
      if (ui.audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) onReady();
    });
    if (token !== state.playToken) return;
    ui.seek.disabled = false; ui.play.disabled = false; setFolderProgress(true, 100, `Audio ready · ${song.name}`);
    if (autoplay) await ui.audio.play();
    setPlayerMessage(autoplay ? 'Playing' : 'Ready to play', 'success'); ui.play.textContent = ui.audio.paused ? '▶' : 'Ⅱ';
    ui.play.setAttribute('aria-label', ui.audio.paused ? 'Play' : 'Pause'); ui.bars.classList.toggle('active', !ui.audio.paused); updateSongRowState(song.id); maybePreload(true);
  } catch (error) {
    if (token !== state.playToken) return;
    console.error(`[Orbit] Could not play ${song.path}:`, error); state.failed.add(song.id);
    if (state.currentId === song.id) updateQueueDownloadProgress(song, state.downloadProgress?.received || 0, state.downloadProgress?.total || song.size, 'Download failed');
    setPlayerMessage(error.message || 'Could not retrieve or play this track.', 'error'); ui.play.disabled = true; ui.play.textContent = '▶'; ui.play.setAttribute('aria-label', 'Play'); ui.bars.classList.remove('active'); revokeCurrentUrl(); setFolderProgress(false); updateSongRowState(song.id);
  }
}
function togglePlay() {
  if (!state.currentId) {
    const song = currentQueue()[0];
    if (song) playSong(song);
    return;
  }
  if (ui.audio.paused && ui.audio.src) {
    ui.audio.play().catch(error => { console.error('[Orbit] Playback could not start:', error); setPlayerMessage('Playback could not start. Select the track again.', 'error'); });
  } else if (ui.audio.src) ui.audio.pause();
  else {
    const song = currentQueue().find(item => item.id === state.currentId) || state.songs.find(item => item.id === state.currentId);
    if (song) playSong(song);
  }
}
function enqueueNext(song) {
  if (!song || trackIdentity(song) === trackIdentity(state.currentSong)) return;
  if (!state.currentId) return playSong(song, true, {source:collectionSource()});
  const existing = state.queue.find((item) => trackIdentity(item) === trackIdentity(song));
  const entry = existing || song;
  state.queue = state.queue.filter((item) => item.id !== entry.id);
  state.queue.unshift(entry);
  state.prioritized.delete(entry.id); state.prioritized = new Set([entry.id, ...state.prioritized]);
  applyQueueChange(); setPlayerMessage(`${entry.name} is next`, 'success');
}
function toggleShuffle() {
  if (!state.shuffle) {
    state.shuffle = true; state.prioritized.clear(); state.queue = shuffleArray(upcomingQueue());
  } else return reshuffleQueue();
  ui.shuffle.setAttribute('aria-pressed', String(state.shuffle));
  ui.shuffleOff.hidden = !state.shuffle; applyQueueChange();
}
function turnShuffleOff() {
  if (!state.shuffle) return;
  state.shuffle = false;
  const priorities = state.queue.filter((song) => state.prioritized.has(song.id));
  const ranks = new Map(state.sourceQueue.map((song, index) => [song.id, index]));
  const ordinary = state.queue.filter((song) => !state.prioritized.has(song.id)).sort((a,b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
  state.queue = [...priorities, ...ordinary]; ui.shuffle.setAttribute('aria-pressed', 'false'); ui.shuffleOff.hidden = true; applyQueueChange();
}
function reshuffleQueue() {
  if (!state.shuffle) state.shuffle = true;
  state.queue = shuffleArray(upcomingQueue()); state.prioritized.clear(); ui.shuffle.setAttribute('aria-pressed', 'true'); ui.shuffleOff.hidden = false;
  applyQueueChange();
}
function stopPlayback() {
  const previousId = state.currentId;
  ++state.playToken; cancelPreload(); state.activeDownloadStream?.destroy?.(); state.activeDownloadStream = null;
  ui.audio.pause(); revokeCurrentUrl(); state.currentId = null; state.currentSong = null; state.queue = []; state.sourceQueue = []; state.prioritized.clear(); state.history = [];
  ui.play.disabled = true; ui.previous.disabled = true; ui.next.disabled = true; ui.download.disabled = true; ui.seek.disabled = true;
  state.downloadProgress = null; state.preloadFailure = null; updateQueueCounts(); ui.nowTitle.textContent = 'Nothing playing yet'; updateNowTitleScroll(); ui.nowFolder.textContent = 'Choose a track to begin'; setPlayerMessage('Playback stopped');
  updateSongRowState(previousId); updateNextPreloadIndicator(); if (state.page === 'queue') renderQueue();
}
function downloadCurrent() {
  const song = state.currentSong; if (!song) return;
  const button = ui.download; button.disabled = true; button.textContent = '…'; setPlayerMessage(`Preparing download · ${song.name}`);
  getSongBlob(song, 'playback').then((blob) => {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = song.name.replace(/[\\/:*?"<>|]/g, '_') || 'audio'; anchor.rel = 'noopener'; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000); setPlayerMessage(`Download started · ${song.name}`, 'success');
  }).catch((error) => setPlayerMessage(`Download failed: ${error.message}`, 'error')).finally(() => { button.disabled = !state.currentSong; button.textContent = '⇩'; });
}
function warnMegaPlaylistEdit() {
  let shown = false; try { shown = localStorage.getItem('orbit-mega-playlist-edit-warning') === 'shown'; } catch {}
  if (state.view === 'all' || state.view.startsWith('device-') || shown) return true;
  const accepted = window.confirm('Editing changes only this website session or the playlist copy you save to your device. The playlist in the MEGA folder will not be modified. Download the edited playlist to preserve its order.');
  try { localStorage.setItem('orbit-mega-playlist-edit-warning', 'shown'); } catch {}
  return accepted;
}
function activeEditablePlaylist() { return state.view.startsWith('device-') ? state.devicePlaylists.find((playlist) => playlist.id === state.view) : state.megaPlaylists.find((playlist) => playlist.id === state.view); }
function editPlaylist() {
  if (!state.editMode && !warnMegaPlaylistEdit()) return;
  state.editMode = !state.editMode; renderRows();
}
function playlistM3UText(playlist) {
  return ['#EXTM3U', ...playlist.songs.map((song) => `#EXTINF:${Math.round(song.durationHint || -1)},${song.playlistTitle || song.name}\n${song.url || song.playlistPath || song.path}`)].join('\n');
}
function savePlaylist() {
  const playlist = activeEditablePlaylist(); if (!playlist) return;
  if (state.view !== 'device' && !warnMegaPlaylistEdit()) return;
  const blob = new Blob([playlistM3UText(playlist)], {type:'audio/x-mpegurl;charset=utf-8'}), url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${playlist.name || 'orbit-playlist'}.m3u8`.replace(/[\\/:*?"<>|]/g, '_'); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (state.view.startsWith('device-')) { playlist.dirty = false; updateDevicePlaylistSummary(playlist); }
  setStatus('Edited playlist download started. The source playlist was not changed.', 'success');
}
function updateDevicePlaylistSummary(playlist) {
  ui.summary.hidden = false;
  ui.summary.textContent = devicePlaylistSummaryText(playlist);
}
function editEntry(action, id) {
  const list = collectionSource(), index = list.findIndex((song) => song.id === id); if (index < 0) return;
  if (!warnMegaPlaylistEdit()) return;
  const playlist = activeEditablePlaylist(); if (!playlist) return;
  const oldIds = new Set(playlist.songs.map((song) => song.id));
  const songs = playlist.songs;
  if (action === 'remove-entry') songs.splice(index, 1);
  else { const target = action === 'move-up' ? index - 1 : index + 1; if (target < 0 || target >= songs.length) return; [songs[index], songs[target]] = [songs[target], songs[index]]; }
  if (state.view.startsWith('device-')) playlist.dirty = true;
  const current = state.currentSong; if (current && !songs.some((song) => song.id === current.id) && current.source === playlist.id) state.queue = state.queue.filter((song) => song.id !== current.id);
  if (state.view.startsWith('device-')) updateDevicePlaylistSummary(playlist);
  refreshQueueAfterPlaylistEdit(playlist, oldIds); renderRows();
}
function refreshQueueAfterPlaylistEdit(playlist, oldIds) {
  const activeQueueWasEdited = state.sourceQueue.some((song) => oldIds.has(song.id)) || oldIds.has(state.currentId);
  if (!activeQueueWasEdited) return;
  state.sourceQueue = [...playlist.songs];
  const currentIndex = state.sourceQueue.findIndex((song) => song.id === state.currentId);
  if (currentIndex >= 0) {
    const ordered = [...state.sourceQueue.slice(currentIndex + 1), ...state.sourceQueue.slice(0, currentIndex)];
    const protectedEntries = state.queue.filter((song) => state.prioritized.has(song.id) && state.sourceQueue.some((item) => item.id === song.id));
    state.queue = [...protectedEntries, ...ordered.filter((song) => !state.prioritized.has(song.id))];
  } else state.queue = state.queue.filter((song) => state.sourceQueue.some((item) => item.id === song.id));
  applyQueueChange();
}
function reorderPlaylistEntry(fromId, toId) {
  if (!state.editMode || fromId === toId || !warnMegaPlaylistEdit()) return;
  const playlist = activeEditablePlaylist(); if (!playlist) return;
  const from = playlist.songs.findIndex((song) => song.id === fromId), to = playlist.songs.findIndex((song) => song.id === toId);
  if (from < 0 || to < 0) return;
  const oldIds = new Set(playlist.songs.map((song) => song.id));
  const [song] = playlist.songs.splice(from, 1); playlist.songs.splice(to, 0, song);
  if (state.view.startsWith('device-')) playlist.dirty = true;
  if (state.view.startsWith('device-')) updateDevicePlaylistSummary(playlist);
  refreshQueueAfterPlaylistEdit(playlist, oldIds); renderRows();
}
function nextTrack(direction = 1) {
  if (direction < 0) {
    const previous = state.history.pop(); if (previous) { state.queue.unshift(state.currentSong); state.prioritized.delete(state.currentId); return playSong(previous, true, {preserveQueue:true}); }
    return;
  }
  const current = state.currentSong;
  let next = state.queue.shift();
  if (!next && state.repeat && state.sourceQueue.length) { const candidates = state.sourceQueue.filter((song) => song.id !== state.currentId); next = state.shuffle ? shuffleArray(candidates)[0] : candidates.find((song) => song.id !== state.currentId); }
  if (!next) { ui.audio.pause(); setPlayerMessage('End of queue'); ui.next.disabled = true; return; }
  if (current) state.history.push(current); state.prioritized.delete(next.id);
  playSong(next, true, {preserveQueue:true});
}
function updatePlayState() {
  const playing = !ui.audio.paused;
  ui.play.textContent = playing ? 'Ⅱ' : '▶';
  ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  ui.play.title = playing ? 'Pause' : 'Play';
  ui.bars.classList.toggle('active', playing);
  if (state.currentId) setPlayerMessage(playing ? 'Playing' : 'Paused', playing ? 'success' : '');
  updateSongRowState(state.currentId);
}
function setTab(view) {
  if (state.view === view && state.page === 'library') return;
  state.view = view; state.editMode = false;
  if (state.page !== 'library') setPage('library');
  renderRows();
}
function queuePlaylistSnapshot() {
  const current = state.currentSong && !ui.audio.ended ? [state.currentSong] : [];
  return [...current, ...upcomingQueue()];
}
function saveQueueAsPlaylist(name) {
  const playlistName = String(name || '').trim();
  if (!playlistName) return {ok:false, message:'Enter a playlist name.'};
  // Capture the live playback order only when Save is confirmed.
  const snapshot = queuePlaylistSnapshot();
  if (!snapshot.length) return {ok:false, message:'Your queue is empty. Add a song before saving a playlist.'};
  let id;
  do { id = `device-queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  while ([...state.devicePlaylists, ...state.megaPlaylists].some((playlist) => playlist.id === id));
  const songs = snapshot.map((song, index) => ({...song, originalId:song.id, id:`${id}:entry:${index}`, source:id}));
  const playlist = {
    id, name:playlistName, fileName:`${playlistName}.m3u8`, source:'Queue snapshot',
    entries:songs.map((song) => ({path:song.path, title:song.playlistTitle || song.name})),
    songs, unmatched:[], dirty:false
  };
  state.devicePlaylists.push(playlist);
  state.view = id; state.editMode = false;
  setPage('playlists');
  renderRows();
  setPlayerMessage(`Queue saved as ${playlistName}`, 'success');
  return {ok:true, playlist};
}
function openQueueSaveDialog() {
  state.savingQueuePlaylist = false;
  ui.queueSaveConfirm.disabled = false;
  ui.queuePlaylistName.value = '';
  ui.queueSaveFeedback.textContent = '';
  if (typeof ui.queueSaveDialog.showModal === 'function') ui.queueSaveDialog.showModal();
  else ui.queueSaveDialog.setAttribute('open', '');
  ui.queuePlaylistName.focus?.();
}
function closeQueueSaveDialog() {
  if (typeof ui.queueSaveDialog.close === 'function' && ui.queueSaveDialog.open) ui.queueSaveDialog.close();
  else ui.queueSaveDialog.removeAttribute('open');
  state.savingQueuePlaylist = false;
  ui.queueSaveConfirm.disabled = false;
  ui.queueSave.focus?.();
}
function handleQueueSaveSubmit(event) {
  event.preventDefault();
  if (state.savingQueuePlaylist) return;
  state.savingQueuePlaylist = true;
  ui.queueSaveConfirm.disabled = true;
  const result = saveQueueAsPlaylist(ui.queuePlaylistName.value);
  if (!result.ok) {
    ui.queueSaveFeedback.textContent = result.message;
    state.savingQueuePlaylist = false;
    ui.queueSaveConfirm.disabled = false;
    return;
  }
  closeQueueSaveDialog();
  $('#playlist-detail-title').focus?.();
}
function scrollQueueToTop() { $('#queue-view').scrollIntoView?.({behavior:'smooth', block:'start'}); }
function scrollSongListToTop(list) {
  if (!list) return;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = reducedMotion ? 'auto' : 'smooth';
  list.scrollIntoView?.({behavior, block:'start'});
  if (typeof list.scrollTo === 'function') list.scrollTo({top:0, behavior});
  else list.scrollTop = 0;
}
function scrollPlaylistToTop() {
  scrollSongListToTop(ui.playlistSongList);
}
function scrollLibraryToTop() { scrollSongListToTop(ui.list); }
function activateMainNav(page, event) {
  if (event.detail >= 2) { if (page === 'queue') scrollQueueToTop(); return; }
  const changed = state.page !== page;
  setPage(page);
  if (changed && (page === 'library' || page === 'playlists')) renderRows();
}
function activateLibraryCollection(view, event) {
  if (event.detail >= 2) {
    if (state.view !== view || state.page !== 'library') setTab(view);
    scrollLibraryToTop(); return;
  }
  setTab(view);
}
function openPlaylist(id, event) {
  if (event.detail >= 2) {
    if (state.view !== id || state.page !== 'playlists') { state.view = id; state.editMode = false; setPage('playlists'); renderRows(); }
    scrollPlaylistToTop(); return;
  }
  if (state.view === id && state.page === 'playlists') return;
  state.view = id; state.editMode = false;
  setPage('playlists'); renderRows();
}
function initialize() {
  window.orbitInitialized = true;
  ui.url.value = DEFAULT_FOLDER_URL;
  ui.importUrl.value = DEFAULT_PLAYLIST_FOLDER_URL;
  ui.form.addEventListener('submit', loadFolder);
  ui.file.addEventListener('change', () => importPlaylist(ui.file.files?.[0]));
  ui.localAudio.addEventListener('change', () => matchLocalAudio(ui.localAudio.files));
  ui.clear.addEventListener('click', clearPlaylist);
  ui.queueSave.addEventListener('click', openQueueSaveDialog);
  ui.queueSaveForm.addEventListener('submit', handleQueueSaveSubmit);
  ui.queueSaveCancel.addEventListener('click', closeQueueSaveDialog);
  ui.queueSaveDialog.addEventListener('click', (event) => { if (event.target === ui.queueSaveDialog) closeQueueSaveDialog(); });
  ui.nav.forEach((button) => button.addEventListener('click', (event) => activateMainNav(button.dataset.page, event)));
  $('.brand').addEventListener('click', (event) => { event.preventDefault(); setPage('home'); });
  $('#collection-tabs').addEventListener('click', (event) => { const tab = event.target.closest('[data-view]'); if (tab) activateLibraryCollection(tab.dataset.view, event); });
  $('#mobile-collection-nav').addEventListener('click', (event) => { const button = event.target.closest('[data-view]'); if (button) activateLibraryCollection(button.dataset.view, event); });
  const openImport = () => { setPage('playlists'); $('#playlist-import').scrollIntoView({behavior:'smooth', block:'start'}); };
  $('#playlist-add-top').addEventListener('click', openImport);
  ui.importedMega.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-mega]');
    if (remove) { removeMegaPlaylist(remove.dataset.removeMega); return; }
    const open = event.target.closest('[data-open-playlist]');
    if (open) openPlaylist(open.dataset.openPlaylist, event);
  });
  ui.playlistChoices.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-mega]');
    if (remove) { removeMegaPlaylist(remove.dataset.removeMega); return; }
    const button = event.target.closest('[data-mega-choice]'); if (button) chooseMegaPlaylist(button.dataset.megaChoice);
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateNowTitleScroll).observe(ui.nowTitle.parentElement);
  window.addEventListener('resize', updateNowTitleScroll);
  ui.previewMega.addEventListener('click', previewMegaPlaylist);
  ui.edit.addEventListener('click', editPlaylist); ui.save.addEventListener('click', savePlaylist); ui.download.addEventListener('click', downloadCurrent);
  let searchTimer = 0;
  ui.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderRows, 110); });
  const handleSongListClick = (event) => {
    const row = event.target.closest('[data-song-id]');
    if (!row) return;
    const song = collectionSource().find(item => item.id === row.dataset.songId), action = event.target.closest('[data-action]')?.dataset.action;
    if (!song) return;
    if (!action || action === 'play') playSong(song, true, {source:collectionSource()});
    else if (action === 'play-next') enqueueNext(song);
    else editEntry(action, song.id);
  };
  [ui.list, ui.playlistSongList].forEach((list) => list.addEventListener('click', handleSongListClick));
  const handleSongDragStart = (event) => {
    const row = event.target.closest('.song-row[draggable="true"]'); if (!row || !state.editMode) return;
    event.dataTransfer?.setData('text/plain', row.dataset.songId); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };
  const handleSongDragOver = (event) => { if (state.editMode && event.target.closest('.song-row')) event.preventDefault(); };
  const handleSongDrop = (event) => {
    const target = event.target.closest('.song-row[draggable="true"]'), fromId = event.dataTransfer?.getData('text/plain');
    if (!target || !fromId) return; event.preventDefault(); reorderPlaylistEntry(fromId, target.dataset.songId);
  };
  [ui.list, ui.playlistSongList].forEach((list) => { list.addEventListener('dragstart', handleSongDragStart); list.addEventListener('dragover', handleSongDragOver); list.addEventListener('drop', handleSongDrop); });
  ui.queue.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-queue]');
    if (remove) { const id = remove.dataset.removeQueue; state.queue = state.queue.filter((song) => song.id !== id); state.prioritized.delete(id); applyQueueChange(); return; }
    const playNext = event.target.closest('[data-queue-play-next]');
    if (playNext) { const song = upcomingQueue().find((item) => item.id === playNext.dataset.queuePlayNext); if (song) enqueueNext(song); return; }
    const move = event.target.closest('[data-move-queue]'); if (move) moveQueueSong(move.dataset.queueId, move.dataset.moveQueue === 'up' ? -1 : 1);
  });
  ui.queue.addEventListener('dragstart', (event) => { const row = event.target.closest('[data-queue-song-id]'); if (!row) return; event.dataTransfer?.setData('text/plain', row.dataset.queueSongId); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
  ui.queue.addEventListener('dragover', (event) => { if (event.target.closest('[data-queue-song-id]')) event.preventDefault(); });
  ui.queue.addEventListener('drop', (event) => { const row = event.target.closest('[data-queue-song-id]'), from = event.dataTransfer?.getData('text/plain'); if (row && from) { event.preventDefault(); reorderQueueSong(from, row.dataset.queueSongId); } });
  ui.play.addEventListener('click', togglePlay);
  ui.previous.addEventListener('click', () => nextTrack(-1));
  ui.next.addEventListener('click', () => nextTrack(1));
  ui.shuffle.addEventListener('click', toggleShuffle); ui.shuffleOff.addEventListener('click', turnShuffleOff);
  ui.repeat.addEventListener('click', () => { state.repeat = !state.repeat; ui.repeat.setAttribute('aria-pressed', String(state.repeat)); });
  const playCollection = () => { const songs = collectionSource(); if (songs[0]) playSong(songs[0], true, {source:songs}); };
  ui.queueAll.addEventListener('click', playCollection);
  ui.queuePagePlayAll.addEventListener('click', playCollection);
  ui.queueStart.addEventListener('click', () => nextTrack(1));
  ui.nav.forEach((button, index) => button.addEventListener('keydown', (event) => {
    if (!['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(event.key)) return;
    event.preventDefault(); const delta = ['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1;
    ui.nav[(index + delta + ui.nav.length) % ui.nav.length].focus();
  }));
  ui.seek.addEventListener('input', () => { state.isSeeking = true; if (Number.isFinite(ui.audio.duration)) ui.current.textContent = formatTime(ui.audio.duration * Number(ui.seek.value) / 1000); });
  ui.seek.addEventListener('change', () => { if (Number.isFinite(ui.audio.duration)) ui.audio.currentTime = ui.audio.duration * Number(ui.seek.value) / 1000; state.isSeeking = false; });
  ui.volume.addEventListener('input', () => { ui.audio.volume = Number(ui.volume.value); ui.volumeLabel.textContent = `${Math.round(ui.audio.volume * 100)}%`; if (ui.audio.volume > 0) state.previousVolume = ui.audio.volume; });
  ui.mute.addEventListener('click', () => {
    if (ui.audio.volume > 0) { state.previousVolume = ui.audio.volume; ui.audio.volume = 0; }
    else ui.audio.volume = state.previousVolume || .75;
    ui.volume.value = String(ui.audio.volume);
    ui.volumeLabel.textContent = `${Math.round(ui.audio.volume * 100)}%`;
    ui.mute.textContent = ui.audio.volume === 0 ? '◖̸' : '◖';
    ui.mute.setAttribute('aria-label', ui.audio.volume === 0 ? 'Unmute' : 'Mute');
  });
  ui.audio.volume = Number(ui.volume.value);
  ui.audio.addEventListener('play', () => { updatePlayState(); maybePreload(true); });
  ui.audio.addEventListener('pause', updatePlayState);
  ui.audio.addEventListener('ended', () => { if (state.repeat) { ui.audio.currentTime = 0; ui.audio.play(); } else nextTrack(1); });
  ui.audio.addEventListener('timeupdate', () => {
    if (Number.isFinite(ui.audio.duration)) {
      if (!state.isSeeking) ui.seek.value = String(Math.round(ui.audio.currentTime / ui.audio.duration * 1000));
      ui.current.textContent = formatTime(ui.audio.currentTime);
      if (ui.audio.currentTime >= ui.audio.duration * .5 && (state.preload?.status === 'waiting' || (!state.preload && !state.preloadFailure))) maybePreload();
    }
  });
  ui.audio.addEventListener('loadedmetadata', () => { ui.total.textContent = formatTime(ui.audio.duration); if (state.currentSong) { state.currentSong.durationHint = ui.audio.duration; updateSongRowState(state.currentId); } });
  ui.audio.addEventListener('error', () => { if (state.currentId && ui.audio.src) setPlayerMessage('Audio playback error. Try downloading this track again.', 'error'); });
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input,textarea,select') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space' && !event.target.isContentEditable) { event.preventDefault(); togglePlay(); }
    if (event.key.toLowerCase() === 'j') nextTrack(-1);
    if (event.key.toLowerCase() === 'k') nextTrack(1);
    if (event.key === '/') { event.preventDefault(); setPage('library'); ui.search.focus(); }
  });
  window.addEventListener('beforeunload', revokeCurrentUrl);
  renderRows(); setPage(state.page);
  setStatus('Preparing the MEGA browser client…', 'loading');
  loadMegaClient().then(() => {
    if (!state.loading) setStatus('MEGA client ready. Load a public folder to discover your songs.');
  }).catch((error) => {
    console.error('[Orbit] Could not load MEGAJS browser module:', error);
    setStatus('MEGA client is unavailable right now. Check your connection and press Load folder to retry.', 'error');
  });
}

initialize();

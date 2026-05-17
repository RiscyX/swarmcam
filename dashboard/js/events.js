const _liveEvents = [];
const MAX_LIVE_EVENTS = 20;

function addLiveEvent(msg) {
  _liveEvents.unshift(msg);
  if (_liveEvents.length > MAX_LIVE_EVENTS) _liveEvents.pop();
  renderLiveFeed();
  flashCameraCard(msg.camera);
}

function flashCameraCard(cameraName) {
  if (!cameraName) return;
  const safeIp = Object.keys(_cameras).find(k => _cameras[k].name === cameraName);
  if (!safeIp) return;
  const card = document.getElementById(`card-${safeIp}`);
  if (!card) return;
  card.classList.add('event-flash');
  setTimeout(() => card.classList.remove('event-flash'), 1000);
}

function renderLiveFeed() {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  if (!_liveEvents.length) {
    feed.innerHTML = '<div class="empty-feed">Nincs élő esemény</div>';
    return;
  }
  feed.innerHTML = _liveEvents.map(e => {
    const ts    = e.timestamp ? new Date(e.timestamp * 1000).toLocaleTimeString('hu-HU') : '';
    const cam   = e.camera || '—';
    const label = e.label  || '—';
    const score = e.score  != null ? Math.round(e.score * 100) + '%' : '';
    return eventCardHTML(e.id, label, cam, score, ts);
  }).join('');
}

async function searchEvents() {
  const camera = document.getElementById('ev-cam-select')?.value  || '';
  const label  = document.getElementById('ev-label-select')?.value || '';
  const date   = document.getElementById('ev-date')?.value        || '';
  const listEl = document.getElementById('event-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="empty-feed">Keresés…</div>';

  const params = new URLSearchParams({ limit: 100 });
  if (camera) params.set('camera', camera);
  if (label && label !== 'all') params.set('label', label);
  if (date) {
    const d = new Date(date);
    params.set('after',  Math.floor(d.getTime() / 1000));
    d.setDate(d.getDate() + 1);
    params.set('before', Math.floor(d.getTime() / 1000));
  }

  try {
    const r = await fetch(`${API}/api/events?${params}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    const events = await r.json();
    if (!events.length) { listEl.innerHTML = '<div class="empty-feed">Nincs találat</div>'; return; }
    listEl.innerHTML = events.map(e => {
      const ts    = e.start_time ? new Date(e.start_time * 1000).toLocaleString('hu-HU') : '';
      const label = e.label     || '—';
      const cam   = e.camera    || '—';
      const score = e.top_score != null ? Math.round(e.top_score * 100) + '%' : '';
      return eventCardHTML(e.id, label, cam, score, ts);
    }).join('');
  } catch {
    listEl.innerHTML = '<div class="empty-feed err">Hiba a lekérdezés során</div>';
  }
}

function eventCardHTML(id, label, cam, score, ts) {
  const thumb = id
    ? `<img class="ev-thumb" src="${API}/api/events/${id}/thumbnail" loading="lazy" onerror="this.style.visibility='hidden'">`
    : '<div class="ev-thumb"></div>';
  const onclick = id ? `onclick="viewEventSnapshot('${id}')"` : '';
  return `<div class="event-card${id ? ' ev-clickable' : ''}" ${onclick}>
    ${thumb}
    <div class="ev-info">
      <span class="ev-label">${label}</span>
      <span class="ev-cam">${cam}</span>
      ${score ? `<span class="ev-score">${score}</span>` : ''}
      ${ts    ? `<span class="ev-ts">${ts}</span>`       : ''}
    </div>
  </div>`;
}

function viewEventSnapshot(eventId) {
  const modal = document.getElementById('ev-snapshot-modal');
  const img   = document.getElementById('ev-snapshot-img');
  if (!modal || !img) return;
  img.src = `${API}/api/events/${eventId}/thumbnail`;
  modal.classList.remove('hidden');
}

function closeSnapshotModal() {
  const modal = document.getElementById('ev-snapshot-modal');
  const img   = document.getElementById('ev-snapshot-img');
  if (img)   img.src = '';
  if (modal) modal.classList.add('hidden');
}

function populateEventCamSelect() {
  const sel = document.getElementById('ev-cam-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">Minden kamera</option>';
  Object.values(_cameras).forEach(cam => {
    const disp = cam.name.replace('cam_', '').replace(/_/g, '.');
    sel.insertAdjacentHTML('beforeend', `<option value="${cam.name}">${disp}</option>`);
  });
  if (prev) sel.value = prev;
}

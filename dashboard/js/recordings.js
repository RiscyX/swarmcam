function initRecordings() {
  populateRecCamSelect();
}

function populateRecCamSelect() {
  const sel = document.getElementById('rec-cam-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">Minden kamera</option>';
  Object.values(_cameras).forEach(cam => {
    const disp = cam.name.replace('cam_', '').replace(/_/g, '.');
    sel.insertAdjacentHTML('beforeend', `<option value="${cam.name}">${disp}</option>`);
  });
  if (prev) sel.value = prev;
}

async function searchRecordings() {
  const camera   = document.getElementById('rec-cam-select')?.value || '';
  const label    = document.getElementById('rec-label-select')?.value || '';
  const dateFrom = document.getElementById('rec-date-from')?.value || '';
  const dateTo   = document.getElementById('rec-date-to')?.value || '';
  const listEl   = document.getElementById('rec-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="empty-feed">Keresés…</div>';

  const params = new URLSearchParams({ limit: 50 });
  if (camera) params.set('camera', camera);
  if (label && label !== 'all') params.set('label', label);
  if (dateFrom) {
    const d = new Date(dateFrom);
    params.set('after', Math.floor(d.getTime() / 1000));
  }
  if (dateTo) {
    const d = new Date(dateTo);
    d.setDate(d.getDate() + 1);
    params.set('before', Math.floor(d.getTime() / 1000));
  }

  try {
    const r = await fetch(`${API}/api/recordings/events?${params}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    const events = await r.json();
    if (!events.length) {
      listEl.innerHTML = '<div class="empty-feed">Nincs felvétel</div>';
      return;
    }
    listEl.innerHTML = events.map(e => renderRecCard(e)).join('');
  } catch {
    listEl.innerHTML = '<div class="empty-feed err">Hiba a lekérdezés során</div>';
  }
}

function renderRecCard(e) {
  const ts    = e.start_time ? new Date(e.start_time * 1000).toLocaleString('hu-HU') : '';
  const dur   = e.end_time && e.start_time ? Math.round(e.end_time - e.start_time) + 's' : '';
  const label = e.label || '—';
  const cam   = e.camera || '—';
  const score = e.top_score != null ? Math.round(e.top_score * 100) + '%' : '';
  return `<div class="rec-card" onclick="playClip('${e.id}', ${JSON.stringify({ cam, label, ts })})">
    <img class="rec-thumb" src="${API}/api/recordings/${e.id}/thumbnail" onerror="this.style.display='none'">
    <div class="rec-info">
      <span class="rec-label">${label}</span>
      <span class="rec-cam">${cam}</span>
      ${score ? `<span class="rec-score">${score}</span>` : ''}
      <span class="rec-ts">${ts}</span>
      ${dur ? `<span class="rec-dur">${dur}</span>` : ''}
    </div>
    <div class="rec-play-icon">▶</div>
  </div>`;
}

function playClip(eventId, info) {
  const playerPanel = document.getElementById('rec-player');
  const video       = document.getElementById('rec-video');
  const infoEl      = document.getElementById('rec-player-info');
  if (!playerPanel || !video) return;

  video.src = `${API}/api/recordings/${eventId}/clip`;
  if (infoEl) infoEl.textContent = `${info.label} · ${info.cam} · ${info.ts}`;
  playerPanel.classList.remove('hidden');
  video.play().catch(() => {});
}

function closePlayer() {
  const playerPanel = document.getElementById('rec-player');
  const video       = document.getElementById('rec-video');
  if (video) { video.pause(); video.src = ''; }
  if (playerPanel) playerPanel.classList.add('hidden');
}

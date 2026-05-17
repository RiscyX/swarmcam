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
  const camera   = document.getElementById('rec-cam-select')?.value   || '';
  const label    = document.getElementById('rec-label-select')?.value || '';
  const dateFrom = document.getElementById('rec-date-from')?.value    || '';
  const dateTo   = document.getElementById('rec-date-to')?.value      || '';
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
    if (!events.length) { listEl.innerHTML = '<div class="empty-feed">Nincs felvétel</div>'; return; }
    listEl.innerHTML = events.map(e => renderRecCard(e)).join('');
  } catch {
    listEl.innerHTML = '<div class="empty-feed err">Hiba a lekérdezés során</div>';
  }
}

function renderRecCard(e) {
  const ts    = e.start_time ? new Date(e.start_time * 1000).toLocaleString('hu-HU') : '';
  const dur   = e.end_time && e.start_time ? formatDur(e.end_time - e.start_time) : '';
  const label = e.label     || '—';
  const cam   = e.camera    || '—';
  const score = e.top_score != null ? Math.round(e.top_score * 100) + '%' : '';
  return `<div class="rec-card" onclick="playClip('${e.id}', this.dataset)"
      data-cam="${cam}" data-label="${label}" data-ts="${ts.replace(/"/g,'')}" data-dur="${dur}">
    <img class="rec-thumb" src="${API}/api/recordings/${e.id}/thumbnail" loading="lazy" onerror="this.style.visibility='hidden'">
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

function formatDur(secs) {
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function playClip(eventId, dataset) {
  const modal   = document.getElementById('rec-modal');
  const video   = document.getElementById('rec-modal-video');
  const infoEl  = document.getElementById('rec-modal-info');
  const dlBtn   = document.getElementById('rec-modal-dl');
  if (!modal || !video) return;

  const clipUrl = `${API}/api/recordings/${eventId}/clip`;
  video.src = clipUrl;
  if (infoEl) {
    const { label = '', cam = '', ts = '', dur = '' } = dataset;
    infoEl.textContent = [label, cam, ts, dur].filter(Boolean).join(' · ');
  }
  if (dlBtn) { dlBtn.href = clipUrl; dlBtn.download = `clip_${eventId}.mp4`; }
  modal.classList.remove('hidden');
  video.play().catch(() => {});
}

function closePlayer() {
  const modal = document.getElementById('rec-modal');
  const video = document.getElementById('rec-modal-video');
  if (video) { video.pause(); video.src = ''; }
  if (modal) modal.classList.add('hidden');
}

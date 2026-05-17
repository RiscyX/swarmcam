function populateCamSettingsSelect() {
  const sel = document.getElementById('cs-cam-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— válassz kamerát —</option>';
  Object.values(_cameras).forEach(cam => {
    const disp = cam.name.replace('cam_', '').replace(/_/g, '.');
    const opt = document.createElement('option');
    opt.value = cam.name;
    opt.textContent = disp;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

async function loadCamSettings(name) {
  if (!name) return;
  const statusEl = document.getElementById('cs-status');
  if (statusEl) { statusEl.textContent = 'Betöltés…'; statusEl.className = 'save-msg'; }
  try {
    const r = await fetch(`${API}/api/cameras/${name}/settings`, { headers: authHeaders() });
    if (!r.ok) throw new Error(r.status);
    const s = await r.json();

    const orient = document.querySelector(`input[name="cs-orient"][value="${s.orientation}"]`);
    if (orient) orient.checked = true;

    const qSlider = document.getElementById('cs-quality');
    const qVal    = document.getElementById('cs-quality-val');
    if (qSlider && s.quality != null) { qSlider.value = s.quality; if (qVal) qVal.textContent = s.quality; }

    const vsEl = document.getElementById('cs-video-size');
    if (vsEl && s.video_size) vsEl.value = s.video_size;

    const nvEl = document.getElementById('cs-night-vision');
    if (nvEl && s.night_vision) nvEl.value = s.night_vision;

    if (statusEl) { statusEl.textContent = 'Betöltve'; statusEl.className = 'save-msg ok'; }
  } catch {
    if (statusEl) { statusEl.textContent = 'Nem elérhető'; statusEl.className = 'save-msg err'; }
  }
}

async function saveCamSettings() {
  const name = document.getElementById('cs-cam-select')?.value;
  if (!name) return;
  const statusEl = document.getElementById('cs-status');

  const orientEl = document.querySelector('input[name="cs-orient"]:checked');
  const qSlider  = document.getElementById('cs-quality');
  const vsEl     = document.getElementById('cs-video-size');
  const nvEl     = document.getElementById('cs-night-vision');

  const body = {};
  if (orientEl)        body.orientation  = orientEl.value;
  if (qSlider?.value)  body.quality      = parseInt(qSlider.value);
  if (vsEl?.value)     body.video_size   = vsEl.value;
  if (nvEl?.value)     body.night_vision = nvEl.value;

  if (statusEl) { statusEl.textContent = 'Alkalmazás…'; statusEl.className = 'save-msg'; }
  try {
    const r = await fetch(`${API}/api/cameras/${name}/settings`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(r.status);
    const res = await r.json();
    const applied = res.applied?.join(', ') || '—';
    if (statusEl) { statusEl.textContent = `Alkalmazva: ${applied}`; statusEl.className = 'save-msg ok'; }
  } catch {
    if (statusEl) { statusEl.textContent = 'Hiba az alkalmazás során'; statusEl.className = 'save-msg err'; }
  }
}

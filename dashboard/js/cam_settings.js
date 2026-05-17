function populateCamSettingsSelect() {
  const sel = document.getElementById('cs-cam-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— válassz kamerát —</option>';
  Object.values(_cameras).forEach(cam => {
    const disp = cam.display_name || cam.name.replace('cam_', '').replace(/_/g, '.');
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

    const flipEl = document.getElementById('cs-flip');
    if (flipEl && s.mirror_flip != null) flipEl.value = s.mirror_flip;

    const ffcEl = document.querySelector(`input[name="cs-ffc"][value="${s.ffc}"]`);
    if (ffcEl) ffcEl.checked = true;

    const qSlider = document.getElementById('cs-quality');
    const qVal    = document.getElementById('cs-quality-val');
    if (qSlider && s.quality != null) {
      qSlider.value = s.quality;
      if (qVal) qVal.textContent = s.quality;
    }

    const fpsSlider = document.getElementById('cs-fps');
    const fpsVal    = document.getElementById('cs-fps-val');
    if (fpsSlider && s.video_fps != null) {
      fpsSlider.value = s.video_fps;
      if (fpsVal) fpsVal.textContent = s.video_fps;
    }

    const vsEl = document.getElementById('cs-video-size');
    if (vsEl && s.video_size) vsEl.value = s.video_size;

    const nvEl = document.getElementById('cs-night-vision');
    if (nvEl && s.night_vision) nvEl.value = s.night_vision;

    // load alias
    const aliasEl = document.getElementById('cs-alias');
    if (aliasEl) {
      const ar = await fetch(`${API}/api/cameras/${name}/alias`, { headers: authHeaders() });
      if (ar.ok) { const ad = await ar.json(); aliasEl.value = ad.alias || ''; }
    }

    if (statusEl) { statusEl.textContent = 'Betöltve'; statusEl.className = 'save-msg ok'; }
  } catch {
    if (statusEl) { statusEl.textContent = 'Nem elérhető'; statusEl.className = 'save-msg err'; }
  }
}

async function saveCamSettings() {
  const name = document.getElementById('cs-cam-select')?.value;
  if (!name) return;
  const statusEl = document.getElementById('cs-status');

  const orientEl  = document.querySelector('input[name="cs-orient"]:checked');
  const ffcEl     = document.querySelector('input[name="cs-ffc"]:checked');
  const flipEl    = document.getElementById('cs-flip');
  const qSlider   = document.getElementById('cs-quality');
  const fpsSlider = document.getElementById('cs-fps');
  const vsEl      = document.getElementById('cs-video-size');
  const nvEl      = document.getElementById('cs-night-vision');

  const body = {};
  if (orientEl)         body.orientation  = orientEl.value;
  if (ffcEl)            body.ffc          = ffcEl.value;
  if (flipEl?.value)    body.mirror_flip  = flipEl.value;
  if (qSlider?.value)   body.quality      = parseInt(qSlider.value);
  if (fpsSlider?.value) body.video_fps    = parseInt(fpsSlider.value);
  if (vsEl?.value)      body.video_size   = vsEl.value;
  if (nvEl?.value)      body.night_vision = nvEl.value;

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

    // ffc változott → stream újracsatlakozás kell az új kamera aktiválásához
    if (body.ffc !== undefined && res.applied?.includes('ffc')) {
      reconnectCamStream(name);
      if (statusEl) statusEl.textContent += ' · stream újracsatlakozik…';
    }
  } catch {
    if (statusEl) { statusEl.textContent = 'Hiba az alkalmazás során'; statusEl.className = 'save-msg err'; }
  }
}

async function saveAlias() {
  const name    = document.getElementById('cs-cam-select')?.value;
  const aliasEl = document.getElementById('cs-alias');
  const statusEl = document.getElementById('cs-alias-status');
  if (!name || !aliasEl) return;

  if (statusEl) { statusEl.textContent = 'Mentés…'; statusEl.className = 'save-msg'; }
  try {
    const r = await fetch(`${API}/api/cameras/${name}/alias`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: aliasEl.value }),
    });
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();

    // update display everywhere
    const cam = _cameras[name.replace('cam_', '').replace(/\./g, '_')]
             || Object.values(_cameras).find(c => c.name === name);
    if (cam) {
      cam.display_name = data.display_name;
      const safeIp = cam.ip.replace(/\./g, '_');
      const nameEl = document.querySelector(`#card-${safeIp} .cam-name`);
      if (nameEl) nameEl.textContent = data.display_name;
    }
    populateCamSettingsSelect();
    document.getElementById('cs-cam-select').value = name;

    if (statusEl) { statusEl.textContent = 'Mentve'; statusEl.className = 'save-msg ok'; }
  } catch {
    if (statusEl) { statusEl.textContent = 'Hiba'; statusEl.className = 'save-msg err'; }
  }
}

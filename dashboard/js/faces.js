async function loadFaces() {
  const grid    = document.getElementById('face-grid');
  const banner  = document.getElementById('face-disabled-banner');
  if (!grid) return;

  grid.innerHTML = '<div class="empty-feed">Betöltés…</div>';
  if (banner) banner.classList.add('hidden');

  try {
    const r = await fetch(`${API}/api/faces`, { headers: authHeaders() });
    if (r.status === 404) {
      grid.innerHTML = '';
      if (banner) banner.classList.remove('hidden');
      return;
    }
    if (!r.ok) throw new Error(r.status);
    const faces = await r.json();
    const names = Object.keys(faces);
    if (!names.length) {
      grid.innerHTML = '<div class="empty-feed">Nincs regisztrált arc</div>';
      return;
    }
    grid.innerHTML = names.map(name => `
      <div class="face-card">
        <img class="face-thumb" src="${API}/api/faces/${name}/thumbnail" onerror="this.src=''">
        <div class="face-name">${name}</div>
        <button class="btn btn-danger face-del-btn" onclick="deleteFace('${name}')">Törlés</button>
      </div>`).join('');
  } catch {
    grid.innerHTML = '<div class="empty-feed err">Frigate nem elérhető</div>';
  }
}

async function registerFace() {
  const nameEl   = document.getElementById('face-new-name');
  const fileEl   = document.getElementById('face-new-file');
  const statusEl = document.getElementById('face-reg-status');

  const name = nameEl?.value?.trim();
  const file = fileEl?.files?.[0];
  if (!name || !file) {
    if (statusEl) { statusEl.textContent = 'Adj meg nevet és képet'; statusEl.className = 'save-msg err'; }
    return;
  }

  if (statusEl) { statusEl.textContent = 'Regisztrálás…'; statusEl.className = 'save-msg'; }
  try {
    const createR = await fetch(`${API}/api/faces/${encodeURIComponent(name)}/create`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!createR.ok && createR.status !== 409) throw new Error('create failed');

    const formData = new FormData();
    formData.append('file', file);
    const regR = await fetch(`${API}/api/faces/${encodeURIComponent(name)}/register`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    if (!regR.ok) throw new Error('register failed');

    if (statusEl) { statusEl.textContent = 'Sikeresen regisztrálva'; statusEl.className = 'save-msg ok'; }
    if (nameEl) nameEl.value = '';
    if (fileEl) fileEl.value = '';
    await loadFaces();
  } catch {
    if (statusEl) { statusEl.textContent = 'Hiba a regisztrálás során'; statusEl.className = 'save-msg err'; }
  }
}

async function deleteFace(name) {
  if (!confirm(`Biztosan törlöd az arcot: "${name}"?`)) return;
  try {
    const r = await fetch(`${API}/api/faces/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error(r.status);
    await loadFaces();
  } catch {
    alert('Hiba a törlés során');
  }
}

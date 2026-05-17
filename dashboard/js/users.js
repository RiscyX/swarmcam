let _currentUser = null;

async function loadUsers() {
  const tbody   = document.getElementById('users-tbody');
  const statusEl = document.getElementById('users-status');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Betöltés…</td></tr>';
  if (statusEl) statusEl.textContent = '';

  try {
    const r = await fetch(`${API}/api/users`, { headers: authHeaders() });
    if (r.status === 403) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Csak admin láthatja a felhasználókat</td></tr>';
      return;
    }
    if (!r.ok) throw new Error(r.status);
    const users = await r.json();
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Nincs felhasználó</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td style="font-weight:600;color:var(--text)">${u.username}</td>
        <td><span class="role-badge ${u.role === 'admin' ? 'role-admin' : 'role-viewer'}">${u.role}</span></td>
        <td class="user-actions">
          <button class="btn btn-ghost user-action-btn" onclick="openChangePassword('${u.username}')">Jelszó</button>
          <button class="btn btn-danger user-action-btn" onclick="deleteUser('${u.username}')">Törlés</button>
        </td>
      </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--red)">Frigate nem elérhető</td></tr>';
  }
}

async function createUser() {
  const nameEl  = document.getElementById('new-username');
  const passEl  = document.getElementById('new-password');
  const roleEl  = document.getElementById('new-role');
  const statusEl = document.getElementById('users-status');

  const username = nameEl?.value?.trim();
  const password = passEl?.value;
  const role     = roleEl?.value || 'viewer';

  if (!username || !password) {
    if (statusEl) { statusEl.textContent = 'Felhasználónév és jelszó kötelező'; statusEl.className = 'save-msg err'; }
    return;
  }

  if (statusEl) { statusEl.textContent = 'Létrehozás…'; statusEl.className = 'save-msg'; }
  try {
    const r = await fetch(`${API}/api/users`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (statusEl) { statusEl.textContent = data.detail || 'Hiba a létrehozás során'; statusEl.className = 'save-msg err'; }
      return;
    }
    if (nameEl) nameEl.value = '';
    if (passEl) passEl.value = '';
    if (statusEl) { statusEl.textContent = `"${username}" létrehozva`; statusEl.className = 'save-msg ok'; }
    await loadUsers();
  } catch {
    if (statusEl) { statusEl.textContent = 'Kapcsolódási hiba'; statusEl.className = 'save-msg err'; }
  }
}

function openChangePassword(username) {
  const modal   = document.getElementById('pw-modal');
  const titleEl = document.getElementById('pw-modal-title');
  const passEl  = document.getElementById('pw-new-pass');
  const statusEl = document.getElementById('pw-status');
  if (!modal) return;
  if (titleEl) titleEl.textContent = `Jelszó módosítása: ${username}`;
  if (passEl)  passEl.value = '';
  if (statusEl) statusEl.textContent = '';
  modal.dataset.username = username;
  modal.classList.remove('hidden');
}

function closeChangePassword() {
  const modal = document.getElementById('pw-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitChangePassword() {
  const modal    = document.getElementById('pw-modal');
  const passEl   = document.getElementById('pw-new-pass');
  const statusEl = document.getElementById('pw-status');
  const username = modal?.dataset?.username;
  const password = passEl?.value;

  if (!username || !password) {
    if (statusEl) { statusEl.textContent = 'Add meg az új jelszót'; statusEl.className = 'save-msg err'; }
    return;
  }

  if (statusEl) { statusEl.textContent = 'Mentés…'; statusEl.className = 'save-msg'; }
  try {
    const r = await fetch(`${API}/api/users/${encodeURIComponent(username)}/password`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      if (statusEl) { statusEl.textContent = data.detail || 'Hiba'; statusEl.className = 'save-msg err'; }
      return;
    }
    if (statusEl) { statusEl.textContent = 'Jelszó módosítva'; statusEl.className = 'save-msg ok'; }
    setTimeout(closeChangePassword, 1200);
  } catch {
    if (statusEl) { statusEl.textContent = 'Kapcsolódási hiba'; statusEl.className = 'save-msg err'; }
  }
}

async function deleteUser(username) {
  if (!confirm(`Biztosan törlöd a felhasználót: "${username}"?`)) return;
  try {
    const r = await fetch(`${API}/api/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      alert(data.detail || 'Hiba a törlés során');
      return;
    }
    await loadUsers();
  } catch {
    alert('Kapcsolódási hiba');
  }
}

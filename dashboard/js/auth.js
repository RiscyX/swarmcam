function getToken()   { return localStorage.getItem(TOKEN_KEY); }
function setToken(t)  { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

function authHeaders(extra = {}) {
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}`, ...extra } : extra;
}

function showLogin() {
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('logout-btn').style.display = 'none';
}

function hideLogin() {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('logout-btn').style.display = '';
}

async function doLogin() {
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  btn.disabled = true; btn.textContent = 'Bejelentkezés…'; err.textContent = '';
  try {
    const r = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user:     document.getElementById('login-user').value,
        password: document.getElementById('login-pass').value,
      }),
    });
    const data = await r.json();
    if (r.ok && data.token) { setToken(data.token); hideLogin(); initApp(); }
    else err.textContent = data.message || data.detail || 'Hibás felhasználónév vagy jelszó';
  } catch (e) { err.textContent = 'Kapcsolódási hiba: ' + e.message; }
  finally { btn.disabled = false; btn.textContent = 'Bejelentkezés'; }
}

function logout() { clearToken(); location.reload(); }

async function checkAuth() {
  const t = getToken();
  if (!t) { showLogin(); return; }
  try {
    const r = await fetch(`${API}/api/auth/me`, { headers: authHeaders() });
    if (r.ok)             { hideLogin(); initApp(); }
    else if (r.status === 401) { clearToken(); showLogin(); }
    else                  { showLogin(); }
  } catch { hideLogin(); initApp(); }
}

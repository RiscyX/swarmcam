async function clearRecordings() {
  const btn = document.getElementById('rec-del-btn');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    const r   = await fetch(`${API}/api/recordings`, { method: 'DELETE', headers: authHeaders() });
    const res = await r.json();
    alert(`Törölve: ${res.cleared_mb} MB`);
  } catch (e) { alert('Hiba: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Delete Recordings'; }
}

async function resetCameras() {
  const btn = document.getElementById('reset-btn');
  btn.disabled = true; btn.textContent = 'Resetting…';
  try {
    await fetch(`${API}/api/cameras/reset`, { method: 'POST', headers: authHeaders() });
    renderCameras([]);
  } catch (e) { alert('Hiba: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Reset Cameras'; }
}

async function startScan() {
  const btn = document.getElementById('scan-btn');
  const log = document.getElementById('log');
  btn.disabled = true; btn.textContent = 'Scanning…';
  log.innerHTML = ''; log.className = 'active';

  const body = {
    port:           parseInt(document.getElementById('port').value),
    timeout:        parseFloat(document.getElementById('timeout').value),
    update_frigate: document.getElementById('update-frigate').checked,
  };
  const subnet = document.getElementById('subnet-select').value.trim();
  if (subnet) body.subnet = subnet;

  const resp   = await fetch(`${API}/api/discover/stream`, {
    method:  'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body:    JSON.stringify(body),
  });

  const reader = resp.body.getReader();
  const dec    = new TextDecoder();
  let buffer   = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const parts = buffer.split('\n\n'); buffer = parts.pop();
    for (const chunk of parts) {
      const evLine   = chunk.match(/^event: (.+)$/m)?.[1];
      const dataLine = chunk.match(/^data: (.+)$/m)?.[1];
      if (!dataLine) continue;
      if (evLine === 'progress') {
        const text = JSON.parse(dataLine);
        const div  = document.createElement('div');
        div.className = 'line' + (text.startsWith('[+]') ? ' found' : text.startsWith('[!]') ? ' warn' : '');
        div.textContent = text;
        log.appendChild(div); log.scrollTop = log.scrollHeight;
      }
      if (evLine === 'result') { const found = JSON.parse(dataLine); if (found.length > 0) renderCameras(found); }
      if (evLine === 'done')   { btn.disabled = false; btn.textContent = 'Scan Network'; }
    }
  }
}

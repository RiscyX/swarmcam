async function loadSettings() {
  try {
    const r = await fetch(`${API}/api/config`, { headers: authHeaders() });
    if (!r.ok) return;
    const s = await r.json();
    document.querySelectorAll('input[name="decoder"]').forEach(el => el.checked = el.value === s.decoder);
    document.getElementById('det-fps').value = s.detection_fps;
    document.getElementById('det-res').value = `${s.detection_width}x${s.detection_height}`;
    document.querySelectorAll('input[name="rtsp"]').forEach(el => el.checked = el.value === s.rtsp_transport);
    document.querySelectorAll('input[name="obj"]').forEach(el => el.checked = s.objects.includes(el.value));
    document.getElementById('rec-motion').value = s.record_motion_days;
    document.getElementById('rec-event').value  = s.record_event_days;
  } catch (e) { console.warn('Config betöltés sikertelen:', e); }
}

async function saveSettings() {
  const btn    = document.getElementById('save-btn');
  const status = document.getElementById('save-status');
  btn.disabled = true; btn.textContent = 'Mentés…';
  status.textContent = ''; status.className = 'save-msg';

  const [w, h] = document.getElementById('det-res').value.split('x').map(Number);
  const body = {
    decoder:            document.querySelector('input[name="decoder"]:checked')?.value ?? 'cpu',
    detection_fps:      parseInt(document.getElementById('det-fps').value),
    detection_width:    w,
    detection_height:   h,
    rtsp_transport:     document.querySelector('input[name="rtsp"]:checked')?.value ?? 'tcp',
    record_motion_days: parseInt(document.getElementById('rec-motion').value),
    record_event_days:  parseInt(document.getElementById('rec-event').value),
    objects: [...document.querySelectorAll('input[name="obj"]:checked')].map(e => e.value),
  };

  try {
    const r   = await fetch(`${API}/api/config`, {
      method:  'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify(body),
    });
    const res = await r.json();
    if (res.decoder_changed)        status.textContent = 'Mentve – stack újraindítva';
    else if (res.frigate_restarted) status.textContent = 'Mentve – Frigate újraindítva';
    else                            status.textContent = 'Mentve – Frigate nem fut, konfig alkalmazva indításkor';
    status.className = 'save-msg ok';
  } catch (e) { status.textContent = 'Hiba: ' + e.message; status.className = 'save-msg err'; }
  finally { btn.disabled = false; btn.textContent = 'Mentés & Alkalmazás'; }
}

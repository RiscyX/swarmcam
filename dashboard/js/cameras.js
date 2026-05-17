function batteryColor(lvl) {
  if (lvl == null) return 'var(--text-muted)';
  if (lvl > 50)   return 'var(--green)';
  if (lvl > 20)   return 'var(--amber)';
  return 'var(--red)';
}

function setCount(n) {
  const el = document.getElementById('count');
  if (el) el.textContent = `${n} camera${n !== 1 ? 's' : ''}`;
  const dot = document.getElementById('cam-pill-dot');
  if (dot) dot.className = `pill-dot${n > 0 ? ' live' : ''}`;
}

function renderCameras(cameras) {
  const grid = document.getElementById('grid');
  Object.keys(_cameras).forEach(ip => {
    if (_streamMode[ip] === 'live') { const img = document.getElementById(`snap-${ip}`); if (img) img.src = ''; }
    clearInterval(_snapIntervals[ip]); delete _snapIntervals[ip];
  });
  grid.innerHTML = '';

  if (!cameras.length) {
    setCount(0);
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="6" width="20" height="15" rx="2"/><circle cx="12" cy="13.5" r="3"/><path d="M9 6V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/></svg>
      <div class="empty-title">No cameras detected</div>
      <div class="empty-sub">Run a network scan from the Discovery tab to find IP Webcam devices on your network.</div>
    </div>`;
    return;
  }

  setCount(cameras.length);

  for (const cam of cameras) {
    const safeIp   = cam.ip.replace(/\./g, '_');
    const conns    = cam.video_connections ?? 0;
    const isLive   = conns > 0;
    const dispName = cam.name.replace('cam_', '').replace(/_/g, '.');

    grid.insertAdjacentHTML('beforeend', `
      <div class="camera-card" id="card-${safeIp}">
        <div class="cam-feed" onclick="enterFullscreen('${safeIp}')">
          <img id="snap-${safeIp}" alt=""
               onerror="this.style.visibility='hidden';const _o=document.getElementById('snap-off-${safeIp}');if(_o)_o.style.display='flex';"
               onload="this.style.visibility='';const _o=document.getElementById('snap-off-${safeIp}');if(_o)_o.style.display='none';" />
          <div class="feed-offline" id="snap-off-${safeIp}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="2" x2="22" y2="22"/><path d="M6.71 6.71A10 10 0 0 0 3 12s4 8 9 8a9.85 9.85 0 0 0 5.29-1.71M10.59 10.59A2 2 0 0 0 9.17 12.17"/><path d="M21 21l-1.5-1.5M17 17l-2.5-2.5M12 12l-1-1"/></svg>
            NO SIGNAL
          </div>
          <div class="feed-badge${isLive ? ' live' : ''}" id="badge-${safeIp}">
            <span class="fbdot"></span>${isLive ? 'LIVE' : 'IDLE'}
          </div>
          <button class="stream-toggle" id="stbtn-${safeIp}" onclick="event.stopPropagation(); toggleStreamMode('${safeIp}')">SNAP</button>
        </div>
        <div class="cam-body">
          <div class="cam-name">${dispName}</div>
          <div class="cam-stats" id="stats-${safeIp}">
            <span class="stat-item"><span class="stat-lbl">Cam</span> <span class="stat-val" id="cfps-${safeIp}">—</span></span>
            <span class="stat-item"><span class="stat-lbl">Det</span> <span class="stat-val" id="dfps-${safeIp}">—</span></span>
          </div>
        </div>
      </div>`);

    _cameras[safeIp] = cam;
    startSnapshot(cam);
    loadCameraStats(cam);
  }
}

async function loadCameraStats(cam) {
  const safeIp = cam.ip.replace(/\./g, '_');
  try {
    const r = await fetch(`${API}/api/cameras/${cam.name}/stats`, { headers: authHeaders() });
    if (!r.ok) return;
    const s = await r.json();
    const cfps = document.getElementById(`cfps-${safeIp}`);
    const dfps = document.getElementById(`dfps-${safeIp}`);
    if (cfps) cfps.textContent = s.camera_fps > 0 ? `${s.camera_fps}` : '—';
    if (dfps) dfps.textContent = s.detection_fps > 0 ? `${s.detection_fps}` : '—';
  } catch {}
}

function updateHealthTable(cameras) {
  const tbody = document.getElementById('health-tbody');
  if (!cameras || !cameras.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Nincs kamera</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  for (const cam of cameras) {
    const safeIp   = cam.ip.replace(/\./g, '_');
    const data     = _healthData[safeIp] || cam;
    const online   = data.online !== false;
    const batt     = data.battery_level;
    const color    = batteryColor(batt);
    const charging = data.battery_charging ? ' ⚡' : '';
    const temp     = data.battery_temp_c  != null ? `${data.battery_temp_c}°C` : '—';
    const space    = data.free_space_gb   != null ? `${data.free_space_gb} GB`  : '—';
    const quality  = data.quality         != null ? data.quality + '%'          : '—';
    const nv       = data.night_vision ? 'ON' : 'OFF';
    const dispName = (data.name || cam.name).replace('cam_', '').replace(/_/g, '.');
    const port     = data.port || cam.port || 8080;

    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td style="font-weight:600;color:var(--text)">${dispName}</td>
        <td>
          <span class="health-status">
            <span class="health-dot ${online ? 'online' : 'offline'}"></span>
            ${online ? 'online' : 'offline'}
          </span>
        </td>
        <td>
          <span class="batt-mini">
            <span class="batt-mini-bar"><span class="batt-mini-fill" style="width:${batt ?? 0}%;background:${color}"></span></span>
            <span style="color:${color}">${batt != null ? batt + '%' + charging : '—'}</span>
          </span>
        </td>
        <td>${temp}</td>
        <td>${space}</td>
        <td>${quality}</td>
        <td>${nv}</td>
        <td style="font-size:11px">${cam.ip}:${port}</td>
      </tr>`);
  }
}

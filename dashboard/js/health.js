function updateCameraHealth(cameras) {
  if (!cameras || !cameras.length) return;
  for (const cam of cameras) {
    const safeIp = cam.ip.replace(/\./g, '_');
    _healthData[safeIp] = cam;

    const card = document.getElementById(`card-${safeIp}`);
    if (!card) continue;

    const conns    = cam.video_connections ?? 0;
    const isLive   = conns > 0;
    const feedBadge = document.getElementById(`badge-${safeIp}`);

    if (!cam.online) {
      card.classList.add('offline');
      if (feedBadge) { feedBadge.className = 'feed-badge offl'; feedBadge.innerHTML = '<span class="fbdot"></span>OFFLINE'; }
    } else {
      card.classList.remove('offline');
      if (feedBadge) {
        feedBadge.className = `feed-badge${isLive ? ' live' : ''}`;
        feedBadge.innerHTML = `<span class="fbdot"></span>${isLive ? 'LIVE' : 'IDLE'}`;
      }
    }
  }
  updateHealthTable(cameras);
}

function connectHealthWS() {
  const dot = document.getElementById('ws-dot');
  const txt = document.getElementById('ws-txt');
  const ws  = new WebSocket(`ws://localhost:8000/ws/cameras`);
  ws.onopen = () => {
    if (dot) dot.className = 's-dot on';
    if (txt) txt.textContent = 'connected';
  };
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'status') {
      updateCameraHealth(msg.cameras);
      msg.cameras.forEach(c => {
        const cam = _cameras[c.ip.replace(/\./g, '_')];
        if (cam) loadCameraStats(cam);
      });
    }
    if (msg.type === 'alert')        showAlert(msg.message);
    if (msg.type === 'frigate_event') addLiveEvent(msg);
  };
  ws.onclose = () => {
    if (dot) dot.className = 's-dot off';
    if (txt) txt.textContent = 'reconnecting';
    setTimeout(connectHealthWS, 5000);
  };
}

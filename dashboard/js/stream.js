function startSnapshot(cam) {
  const safeIp = cam.ip.replace(/\./g, '_');
  _streamMode[safeIp] = 'snap';
  const refresh = () => {
    const el = document.getElementById(`snap-${safeIp}`);
    if (el) el.src = `${API}/api/cameras/${cam.name}/snapshot?t=${Date.now()}`;
  };
  refresh();
  clearInterval(_snapIntervals[safeIp]);
  _snapIntervals[safeIp] = setInterval(refresh, 3000);
}

function startLiveStream(cam) {
  const safeIp = cam.ip.replace(/\./g, '_');
  const img    = document.getElementById(`snap-${safeIp}`);
  const btn    = document.getElementById(`stbtn-${safeIp}`);
  clearInterval(_snapIntervals[safeIp]);
  delete _snapIntervals[safeIp];
  if (img) img.src = `${API}/api/cameras/${cam.name}/stream`;
  if (btn) { btn.textContent = 'LIVE'; btn.classList.add('is-live'); }
  _streamMode[safeIp] = 'live';
}

function stopLiveStream(safeIp) {
  const cam = _cameras[safeIp];
  if (!cam) return;
  const img = document.getElementById(`snap-${safeIp}`);
  const btn = document.getElementById(`stbtn-${safeIp}`);
  if (img) img.src = '';
  if (btn) { btn.textContent = 'SNAP'; btn.classList.remove('is-live'); }
  _streamMode[safeIp] = 'snap';
  startSnapshot(cam);
}

function toggleStreamMode(safeIp) {
  if (_streamMode[safeIp] === 'live') stopLiveStream(safeIp);
  else { const cam = _cameras[safeIp]; if (cam) startLiveStream(cam); }
}

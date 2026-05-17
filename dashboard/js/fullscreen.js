function setLayout(layout) {
  _currentLayout = layout;
  const grid = document.getElementById('grid');
  grid.classList.remove('layout-1x1', 'layout-2x2', 'layout-1plus3');
  if (layout !== 'auto') grid.classList.add(`layout-${layout}`);
  document.querySelectorAll('.layout-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layout === layout);
  });
}

function enterFullscreen(safeIp) {
  const cam = _cameras[safeIp];
  if (!cam) return;
  _fsCam        = cam;
  _fsTorchState = !!_torchState[safeIp];

  // Pause all background card streams/snapshots
  Object.keys(_cameras).forEach(ip => {
    clearInterval(_snapIntervals[ip]);
    delete _snapIntervals[ip];
    const cardImg = document.getElementById(`snap-${ip}`);
    if (cardImg) cardImg.src = '';
  });

  const overlay    = document.getElementById('fullscreen-overlay');
  const body       = document.getElementById('fs-body');
  const nameEl     = document.getElementById('fs-name');
  const torchBtn   = document.getElementById('fs-torch-btn');
  const torchLabel = document.getElementById('fs-torch-label');

  nameEl.textContent = cam.display_name || cam.name.replace('cam_', '').replace(/_/g, '.');
  body.innerHTML = '';

  const img = document.createElement('img');
  img.src = `${API}/api/cameras/${cam.name}/stream`;
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  body.appendChild(img);
  _fsImg = img;

  torchBtn.classList.toggle('torch-on', _fsTorchState);
  torchLabel.textContent = _fsTorchState ? 'VAKU BE' : 'VAKU';
  overlay.classList.add('active');
}

function exitFullscreen() {
  if (_fsImg) { _fsImg.src = ''; _fsImg = null; }
  document.getElementById('fullscreen-overlay').classList.remove('active');
  _fsCam = null;

  // Resume background card streams after a short delay to avoid burst
  setTimeout(() => {
    Object.values(_cameras).forEach(cam => {
      const safeIp = cam.ip.replace(/\./g, '_');
      if (_streamMode[safeIp] === 'live') startLiveStream(cam);
      else startSnapshot(cam);
    });
  }, 100);
}

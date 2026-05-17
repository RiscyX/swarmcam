async function toggleTorch(safeIp) {
  const cam = _cameras[safeIp];
  if (!cam) return;
  const btn      = document.getElementById(`torch-${safeIp}`);
  const newState = !_torchState[safeIp];
  try {
    const r = await fetch(`${API}/api/cameras/${cam.name}/torch`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ enabled: newState }),
    });
    if (r.ok) {
      _torchState[safeIp] = newState;
      if (btn) btn.classList.toggle('torch-on', newState);
    }
  } catch {}
}

async function toggleFsTorch() {
  if (!_fsCam) return;
  const safeIp   = _fsCam.ip.replace(/\./g, '_');
  const newState = !_fsTorchState;
  try {
    const r = await fetch(`${API}/api/cameras/${_fsCam.name}/torch`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ enabled: newState }),
    });
    if (r.ok) {
      _fsTorchState = newState;
      _torchState[safeIp] = newState;
      const torchBtn   = document.getElementById('fs-torch-btn');
      const torchLabel = document.getElementById('fs-torch-label');
      if (torchBtn)   torchBtn.classList.toggle('torch-on', newState);
      if (torchLabel) torchLabel.textContent = newState ? 'VAKU BE' : 'VAKU';
      const cardBtn = document.getElementById(`torch-${safeIp}`);
      if (cardBtn) cardBtn.classList.toggle('torch-on', newState);
    }
  } catch {}
}

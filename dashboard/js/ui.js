function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.sec === name));
  document.getElementById('section-label').textContent = SEC_LABELS[name] || name;
  if (name === 'health' && Object.keys(_healthData).length) {
    updateHealthTable(Object.values(_healthData));
  }
  if (name === 'events')     searchEvents();
  if (name === 'recordings') searchRecordings();
}

function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('hu-HU', { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

function showAlert(message) {
  const toast = document.createElement('div');
  toast.className = 'alert-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function checkSystem() {
  try {
    const r = await fetch(`${API}/api/system`, { headers: authHeaders() });
    const sys = await r.json();
    document.querySelectorAll('input[name="decoder"][value="nvidia"]').forEach(el => {
      if (!sys.nvidia_docker) {
        el.disabled = true;
        el.closest('.radio-card').title = sys.nvidia_gpu ? 'nvidia-container-toolkit hiányzik' : 'NVIDIA GPU nem található';
      }
    });
    document.querySelectorAll('input[name="decoder"][value="intel"]').forEach(el => {
      if (!sys.intel_gpu) { el.disabled = true; el.closest('.radio-card').title = 'Intel iGPU nem elérhető'; }
    });
  } catch {}
}

async function loadNetworks() {
  try {
    const r = await fetch(`${API}/api/networks`, { headers: authHeaders() });
    const nets = await r.json();
    const sel = document.getElementById('subnet-select');
    nets.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.subnet;
      opt.textContent = `${n.iface}  ${n.ip}  (${n.subnet})`;
      sel.appendChild(opt);
    });
    if (nets.length === 1) sel.value = nets[0].subnet;
  } catch {}
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('login-overlay').classList.contains('hidden')) doLogin();
  if (e.key === 'Escape') {
    if (document.getElementById('fullscreen-overlay').classList.contains('active')) { exitFullscreen(); return; }
    if (!document.getElementById('ev-snapshot-modal').classList.contains('hidden')) { closeSnapshotModal(); return; }
    if (!document.getElementById('rec-modal').classList.contains('hidden'))         { closePlayer(); return; }
  }
  if (document.getElementById('fullscreen-overlay').classList.contains('active')) return;
  if (e.key === '1') setLayout('1x1');
  if (e.key === '2') setLayout('2x2');
  if (e.key === '3') setLayout('1plus3');
});

function initApp() {
  fetch(`${API}/api/cameras`, { headers: authHeaders() })
    .then(r => r.json())
    .then(cams => {
      if (cams.length) renderCameras(cams);
      populateCamSettingsSelect();
      populateEventCamSelect();
      populateRecCamSelect();
    })
    .catch(() => {});
  loadSettings();
  checkSystem();
  loadNetworks();
  connectHealthWS();
  loadFaces();
}

checkAuth();

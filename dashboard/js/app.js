document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('login-overlay').classList.contains('hidden')) doLogin();
  if (document.getElementById('fullscreen-overlay').classList.contains('active')) {
    if (e.key === 'Escape') exitFullscreen();
    return;
  }
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

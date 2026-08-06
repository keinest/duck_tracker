const userTableBody        = document.getElementById('userTableBody');
const sessionTableBody     = document.getElementById('sessionTableBody');
const locationTableBody    = document.getElementById('locationTableBody');
const periodeSelect        = document.getElementById('periodeSelect');
const triSelect            = document.getElementById('triSelect');
const toast                = document.getElementById('toast');
const logoutLink           = document.getElementById('logoutLink');
const managerDrawerOverlay = document.getElementById('managerDrawerOverlay');
const managerDrawerClose   = document.getElementById('managerDrawerClose');

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDuration(seconds) {
  if (!seconds) return '0 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

async function loadUsers() {
  if (!userTableBody) return;
  userTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Chargement des utilisateurs...</td></tr>`;
  try {
    const res = await authFetch('/api/manager/users');
    const data = await res.json();
    if (!res.ok) {
      userTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur de chargement.</td></tr>`;
      return;
    }
    if (data.length === 0) {
      userTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucun utilisateur trouvé.</td></tr>`;
      return;
    }
    userTableBody.innerHTML = data.map(user => `
      <tr>
        <td>${user.nom}</td>
        <td>${user.prenom}</td>
        <td>${user.telephone}</td>
        <td>${user.role.replace(/_/g, ' ')}</td>
        <td>${user.region || '-'}</td>
        <td>${user.statut_compte === 'actif' ? 'Actif' : 'Inactif'}</td>
      </tr>
    `).join('');
  } catch (err) {
    userTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur de connexion.</td></tr>`;
  }
}

async function loadSessions() {
  if (!sessionTableBody) return;
  sessionTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Chargement de l'historique...</td></tr>`;
  try {
    const params = new URLSearchParams({ periode: periodeSelect?.value || 'mois', tri: triSelect?.value || 'date_desc' });
    const res = await authFetch(`/api/manager/sessions?${params}`);
    const data = await res.json();
    if (!res.ok) {
      sessionTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur de chargement.</td></tr>`;
      return;
    }
    if (data.length === 0) {
      sessionTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucune session trouvée.</td></tr>`;
      return;
    }
    sessionTableBody.innerHTML = data.map(session => `
      <tr class="clickable-row" data-id="${session.id}">
        <td>${session.superviseur}</td>
        <td>${session.region || '-'}</td>
        <td>${formatDate(session.date_session)}</td>
        <td>${formatDuration(session.duree_totale)}</td>
        <td>${session.distance_totale} km</td>
        <td>${session.vitesse_max} km/h</td>
      </tr>
    `).join('');

    document.querySelectorAll('#sessionTableBody tr.clickable-row').forEach(row => {
      row.addEventListener('click', () => openSessionDetail(row.dataset.id));
    });
  } catch (err) {
    sessionTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur de connexion.</td></tr>`;
  }
}

// ===== CARTE MULTI-SUPERVISEURS =======

let carteMap = null;
let carteMarkers = {};

function initCarteMap() {
  if (carteMap || !document.getElementById('carteMap')) return;
  carteMap = L.map('carteMap', { zoomControl: true }).setView([3.848, 11.502], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(carteMap);

  setTimeout(() => { if (carteMap) carteMap.invalidateSize(); }, 200);
  window.addEventListener('resize', () => { if (carteMap) carteMap.invalidateSize(); });
}

function makeSuperviseurIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#ff7900;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>',
    iconSize: [16, 16], iconAnchor: [8, 8]
  });
}

function updateCarteMarkers(locations) {
  if (!carteMap) return;
  const seenIds = new Set();

  locations.forEach(loc => {
    if (loc.latitude == null || loc.longitude == null) return;
    seenIds.add(loc.session_id);

    const popupHtml = `<b>${loc.superviseur}</b><br>${loc.region || ''}<br>${loc.vitesse ?? 0} km/h<br><a href="#" data-open-id="${loc.session_id}" style="color:#ff7900;font-weight:600;">Voir l'itinéraire complet →</a>`;

    if (carteMarkers[loc.session_id]) {
      carteMarkers[loc.session_id].setLatLng([loc.latitude, loc.longitude]);
      carteMarkers[loc.session_id].setPopupContent(popupHtml);
    } else {
      const marker = L.marker([loc.latitude, loc.longitude], { icon: makeSuperviseurIcon() })
        .addTo(carteMap)
        .bindPopup(popupHtml);
      marker.on('click', () => openSessionDetail(loc.session_id));
      carteMarkers[loc.session_id] = marker;
    }
  });

  Object.keys(carteMarkers).forEach(id => {
    if (!seenIds.has(Number(id))) {
      carteMap.removeLayer(carteMarkers[id]);
      delete carteMarkers[id];
    }
  });

  const validLocations = locations.filter(l => l.latitude != null && l.longitude != null);
  if (validLocations.length > 0) {
    const bounds = L.latLngBounds(validLocations.map(l => [l.latitude, l.longitude]));
    carteMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }
}

async function loadLocations() {
  if (!locationTableBody) return;
  initCarteMap();

  try {
    const res = await authFetch('/api/manager/locations');
    const data = await res.json();
    if (!res.ok) {
      locationTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur de chargement.</td></tr>`;
      return;
    }
    if (data.length === 0) {
      locationTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucune session active en ce moment.</td></tr>`;
      updateCarteMarkers([]);
      return;
    }
    locationTableBody.innerHTML = data.map(loc => `
      <tr class="clickable-row" data-id="${loc.session_id}">
        <td>${loc.superviseur}</td>
        <td>${loc.region || '-'}</td>
        <td>${formatDate(loc.heure_debut)} ${formatTime(loc.heure_debut)}</td>
        <td>${loc.latitude ?? '-'}</td>
        <td>${loc.longitude ?? '-'}</td>
        <td>${loc.vitesse ? `${loc.vitesse} km/h` : '-'}</td>
      </tr>
    `).join('');

    document.querySelectorAll('#locationTableBody tr.clickable-row').forEach(row => {
      row.addEventListener('click', () => openSessionDetail(row.dataset.id));
    });

    updateCarteMarkers(data);
  } catch (err) {
    locationTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur de connexion.</td></tr>`;
  }
}

logoutLink?.addEventListener('click', (e) => {
  e.preventDefault();
  logoutUser();
});

periodeSelect?.addEventListener('change', loadSessions);
triSelect?.addEventListener('change', loadSessions);
managerDrawerClose?.addEventListener('click', closeManagerDrawer);
managerDrawerOverlay?.addEventListener('click', (e) => {
  if (e.target === managerDrawerOverlay) closeManagerDrawer();
});

function openSessionDetail(id) {
  if (!id || !managerDrawerOverlay) return;
  managerDrawerOverlay.classList.add('show');
  document.getElementById('managerDrawerTitle').textContent    = 'Chargement du trajet…';
  document.getElementById('managerDrawerRegion').textContent   = '';
  document.getElementById('managerDrawerDuree').textContent    = '--';
  document.getElementById('managerDrawerDistance').textContent = '--';
  document.getElementById('managerDrawerVitesse').textContent  = '--';
  document.getElementById('managerDrawerArrets').textContent   = '--';
  document.getElementById('managerStopList').innerHTML         = '';

  authFetch(`/api/manager/session/${id}`)
    .then(async res => {
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('managerDrawerTitle').textContent = data.message || 'Trajet introuvable';
        return;
      }

      document.getElementById('managerDrawerTitle').textContent    = data.superviseur;
      document.getElementById('managerDrawerRegion').textContent   = data.region || '';
      document.getElementById('managerDrawerDuree').textContent    = formatDuration(data.duree_totale);
      document.getElementById('managerDrawerDistance').textContent = `${data.distance_totale} km`;
      document.getElementById('managerDrawerVitesse').textContent  = `${data.vitesse_max} km/h`;
      document.getElementById('managerDrawerArrets').textContent   = data.arrets.length;

      renderManagerRoute(data.positions);
      renderManagerStops(data.arrets);
    })
    .catch(() => {
      document.getElementById('managerDrawerTitle').textContent = 'Erreur de chargement';
    });
}

let managerDrawerLeafletMap = null;

function renderManagerRoute(positions) {
  if (managerDrawerLeafletMap) {
    managerDrawerLeafletMap.remove();
    managerDrawerLeafletMap = null;
  }

  if (!positions || positions.length < 2) return;

  const latLngs = positions.map(p => [p.lat, p.lng]);

  managerDrawerLeafletMap = L.map('managerDrawerMap', {
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(managerDrawerLeafletMap);

  const polyline = L.polyline(latLngs, { color: '#ff7900', weight: 4, opacity: 0.9 }).addTo(managerDrawerLeafletMap);

  const greenIcon = L.divIcon({
    className: '',
    html: '<div style="width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff;"></div>',
    iconSize: [12, 12], iconAnchor: [6, 6]
  });
  const orangeIcon = L.divIcon({
    className: '',
    html: '<div style="width:12px;height:12px;border-radius:50%;background:#ff7900;border:2px solid #fff;"></div>',
    iconSize: [12, 12], iconAnchor: [6, 6]
  });

  L.marker(latLngs[0], { icon: greenIcon }).addTo(managerDrawerLeafletMap);
  L.marker(latLngs[latLngs.length - 1], { icon: orangeIcon }).addTo(managerDrawerLeafletMap);

  managerDrawerLeafletMap.fitBounds(polyline.getBounds(), { padding: [20, 20] });
  setTimeout(() => { if (managerDrawerLeafletMap) managerDrawerLeafletMap.invalidateSize(); }, 100);
}

function renderManagerStops(arrets) {
  const container = document.getElementById('managerStopList');
  if (!container || !arrets || arrets.length === 0) {
    if (container) {
      container.innerHTML = `<div class="empty-state" style="padding:24px;"><i class="fa-solid fa-flag" style="font-size:20px;"></i><p style="font-size:12.5px;">Aucun arrêt détecté sur ce trajet.</p></div>`;
    }
    return;
  }

  container.innerHTML = arrets.map(a => `
    <div class="stop-item">
      <span class="stop-marker"></span>
      <div class="stop-info">
        <b>${a.adresse || 'Point d\'arrêt'}</b>
        <span>Arrivée à ${formatTime(a.heure_arrivee)}</span>
      </div>
      <span class="stop-duree">${formatDuration(a.duree_arret)}</span>
    </div>
  `).join('');
}

function closeManagerDrawer() {
  managerDrawerOverlay?.classList.remove('show');
}

let managerPollInterval = null;

function startManagerPolling(loadFn) {
  stopManagerPolling();
  managerPollInterval = setInterval(() => {
    if (document.visibilityState === 'visible') loadFn();
  }, 15000);
}

function stopManagerPolling() {
  if (managerPollInterval) clearInterval(managerPollInterval);
}

(async function initManagerPages() {
  const ok = await bootstrapSession();
  if (!ok) return;
  const pathname = window.location.pathname;

  if (pathname.endsWith('/utilisateurs')) {
    await loadUsers();
  } else if (pathname.endsWith('/historique')) {
    await loadSessions();
  } else if (pathname.endsWith('/carte')) {
    await loadLocations();
    startManagerPolling(loadLocations);
  }
})();
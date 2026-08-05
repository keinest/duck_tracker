const userTableBody = document.getElementById('userTableBody');
const sessionTableBody = document.getElementById('sessionTableBody');
const locationTableBody = document.getElementById('locationTableBody');
const periodeSelect = document.getElementById('periodeSelect');
const triSelect = document.getElementById('triSelect');
const toast = document.getElementById('toast');
const logoutLink = document.getElementById('logoutLink');
const managerDrawerOverlay = document.getElementById('managerDrawerOverlay');
const managerDrawerClose = document.getElementById('managerDrawerClose');

let managerMap = null;
let managerPolyline = null;
let managerMarkers = [];

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatTime(iso) {
  if (!iso) return '—';
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
        <td>${user.region || '—'}</td>
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
        <td>${session.region || '—'}</td>
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

async function loadLocations() {
  if (!locationTableBody) return;
  locationTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Chargement des positions actives...</td></tr>`;
  try {
    const res = await authFetch('/api/manager/locations');
    const data = await res.json();
    if (!res.ok) {
      locationTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur de chargement.</td></tr>`;
      return;
    }
    if (data.length === 0) {
      locationTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucune session active en ce moment.</td></tr>`;
      return;
    }
    locationTableBody.innerHTML = data.map(loc => `
      <tr>
        <td>${loc.superviseur}</td>
        <td>${loc.region || '—'}</td>
        <td>${formatDate(loc.heure_debut)} ${formatTime(loc.heure_debut)}</td>
        <td>${loc.latitude ?? '—'}</td>
        <td>${loc.longitude ?? '—'}</td>
        <td>${loc.vitesse ? `${loc.vitesse} km/h` : '—'}</td>
      </tr>
    `).join('');
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
  document.getElementById('managerDrawerTitle').textContent = 'Chargement du trajet…';
  document.getElementById('managerDrawerRegion').textContent = '';
  document.getElementById('managerDrawerDuree').textContent = '--';
  document.getElementById('managerDrawerDistance').textContent = '--';
  document.getElementById('managerDrawerVitesse').textContent = '--';
  document.getElementById('managerDrawerArrets').textContent = '--';
  document.getElementById('managerStopList').innerHTML = '';

  const mapCanvas = document.getElementById('managerMapCanvas');
  const svg = document.getElementById('managerDrawerRoute');
  if (mapCanvas) mapCanvas.innerHTML = '';
  if (svg) svg.innerHTML = '';

  authFetch(`/api/manager/session/${id}`)
    .then(async res => {
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('managerDrawerTitle').textContent = data.message || 'Trajet introuvable';
        return;
      }

      document.getElementById('managerDrawerTitle').textContent = data.superviseur;
      document.getElementById('managerDrawerRegion').textContent = data.region || '';
      document.getElementById('managerDrawerDuree').textContent = formatDuration(data.duree_totale);
      document.getElementById('managerDrawerDistance').textContent = `${data.distance_totale} km`;
      document.getElementById('managerDrawerVitesse').textContent = `${data.vitesse_max} km/h`;
      document.getElementById('managerDrawerArrets').textContent = data.arrets.length;

      renderManagerRoute(data.positions);
      renderManagerStops(data.arrets);
    })
    .catch(() => {
      document.getElementById('managerDrawerTitle').textContent = 'Erreur de chargement';
    });
}

function renderManagerRoute(positions) {
  const mapCanvas = document.getElementById('managerMapCanvas');
  const svg = document.getElementById('managerDrawerRoute');
  if (!positions || positions.length < 2) {
    if (svg) svg.innerHTML = '';
    return;
  }

  if (window.google?.maps && mapCanvas) {
    if (svg) svg.style.display = 'none';
    mapCanvas.style.display = 'block';
    mapCanvas.innerHTML = '';

    const path = positions.map(p => ({ lat: p.lat, lng: p.lng }));
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));

    managerMap = new google.maps.Map(mapCanvas, {
      center: path[0],
      zoom: 13,
      disableDefaultUI: true,
      gestureHandling: 'greedy'
    });

    managerPolyline = new google.maps.Polyline({
      path,
      strokeColor: '#ff7900',
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map: managerMap
    });

    new google.maps.Marker({
      position: path[0],
      map: managerMap,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#22c55e',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#fff'
      }
    });
    new google.maps.Marker({
      position: path[path.length - 1],
      map: managerMap,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#ff7900',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#fff'
      }
    });

    managerMap.fitBounds(bounds);
    return;
  }

  if (svg) {
    svg.style.display = 'block';
    svg.innerHTML = '';
    const lats = positions.map(p => p.lat);
    const lngs = positions.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const rangeLat = (maxLat - minLat) || 0.0001;
    const rangeLng = (maxLng - minLng) || 0.0001;
    const pad = 30;
    const w = 400, h = 300;

    const points = positions.map(p => {
      const x = pad + ((p.lng - minLng) / rangeLng) * (w - pad * 2);
      const y = h - pad - ((p.lat - minLat) / rangeLat) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathD = 'M' + points.join(' L');
    const [startX, startY] = points[0].split(',');
    const [endX, endY] = points[points.length - 1].split(',');

    svg.innerHTML = `
      <path d="${pathD}" fill="none" stroke="#ff7900" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
      <circle cx="${startX}" cy="${startY}" r="5" fill="#22c55e" stroke="#fff" stroke-width="2"/>
      <circle cx="${endX}" cy="${endY}" r="5" fill="#ff7900" stroke="#fff" stroke-width="2"/>
    `;
  }
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
  }
})();

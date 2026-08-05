let currentPeriode = 'mois';
let currentTri = 'date_desc';

const tripList = document.getElementById('tripList');
const resultCount = document.getElementById('resultCount');
const periodTabs = document.querySelectorAll('.period-tab');
const sortSelect = document.getElementById('sortSelect');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerClose = document.getElementById('drawerClose');

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

function formatDate(iso) {
  const d = new Date(iso);
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
function formatHeure(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatDuree(totalSeconds) {
  if (!totalSeconds) return '0min';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`;
}

async function loadHistorique() {
  tripList.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Chargement de l'historique…</p></div>`;
  try {
    const res = await authFetch(`/api/superviseur/historique?periode=${currentPeriode}&tri=${currentTri}`);
    const data = await res.json();

    if (!res.ok) {
      tripList.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Impossible de charger l'historique.</p></div>`;
      return;
    }

    resultCount.textContent = `${data.length} trajet${data.length !== 1 ? 's' : ''}`;

    if (data.length === 0) {
      tripList.innerHTML = `<div class="empty-state"><i class="fa-solid fa-route"></i><p>Aucun trajet sur cette période. Démarrez le partage depuis l'accueil pour commencer.</p></div>`;
      return;
    }

    tripList.innerHTML = data.map(trip => `
      <div class="trip-card" data-id="${trip.id}">
        <div class="trip-icon"><i class="fa-solid fa-route"></i></div>
        <div class="trip-main">
          <div class="trip-date">${formatDate(trip.date_session)}</div>
          <div class="trip-time">${formatHeure(trip.heure_debut)} — ${formatHeure(trip.heure_fin)}</div>
        </div>
        <div class="trip-metrics">
          <div class="trip-metric"><b>${formatDuree(trip.duree_totale)}</b><span>Durée</span></div>
          <div class="trip-metric"><b>${trip.distance_totale} km</b><span>Distance</span></div>
          <div class="trip-metric"><b>${trip.nb_arrets}</b><span>Arrêts</span></div>
        </div>
        <i class="fa-solid fa-chevron-right trip-chevron"></i>
      </div>
    `).join('');

    document.querySelectorAll('.trip-card').forEach(card => {
      card.addEventListener('click', () => openTripDetail(card.dataset.id));
    });

  } catch (err) {
    tripList.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Erreur de connexion au serveur.</p></div>`;
  }
}

periodTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    periodTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentPeriode = tab.dataset.periode;
    loadHistorique();
  });
});

sortSelect.addEventListener('change', () => {
  currentTri = sortSelect.value;
  loadHistorique();
});

// ============ PANNEAU DÉTAIL ============
async function openTripDetail(id) {
  drawerOverlay.classList.add('show');
  document.getElementById('drawerDate').textContent = 'Chargement…';
  document.getElementById('drawerRoute').innerHTML = '';
  document.getElementById('drawerMapCanvas').innerHTML = '';
  document.getElementById('stopList').innerHTML = '';

  try {
    const res = await authFetch(`/api/superviseur/trajet/${id}`);
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('drawerDate').textContent = 'Trajet introuvable';
      return;
    }

    document.getElementById('drawerDate').textContent = formatDate(data.date_session);
    document.getElementById('drawerTimeRange').textContent =
      `${formatHeure(data.heure_debut)} — ${formatHeure(data.heure_fin)}`;
    document.getElementById('drawerDuree').textContent = formatDuree(data.duree_totale);
    document.getElementById('drawerDistance').textContent = `${data.distance_totale} km`;
    document.getElementById('drawerVitesse').textContent = `${data.vitesse_max} km/h`;
    document.getElementById('drawerArrets').textContent = data.arrets.length;

    drawRoute(data.positions);
    renderStops(data.arrets);

  } catch (err) {
    document.getElementById('drawerDate').textContent = 'Erreur de chargement';
  }
}

function drawRoute(positions) {
  const canvas = document.getElementById('drawerMapCanvas');
  const svg = document.getElementById('drawerRoute');

  if (!positions || positions.length < 2) {
    if (svg) svg.innerHTML = '';
    if (canvas) canvas.innerHTML = '';
    return;
  }

  if (window.google?.maps && canvas) {
    if (svg) svg.style.display = 'none';
    canvas.style.display = 'block';
    canvas.innerHTML = '';

    const path = positions.map(p => ({ lat: p.lat, lng: p.lng }));
    const bounds = new google.maps.LatLngBounds();

    path.forEach(p => bounds.extend(p));
    const map = new google.maps.Map(canvas, {
      center: path[0],
      zoom: 13,
      disableDefaultUI: true,
      gestureHandling: 'greedy'
    });

    new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#ff7900',
      strokeOpacity: 0.9,
      strokeWeight: 5,
      map
    });

    new google.maps.Marker({
      position: path[0],
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#22c55e',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2
      }
    });

    new google.maps.Marker({
      position: path[path.length - 1],
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#ff7900',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2
      }
    });

    map.fitBounds(bounds);
    return;
  }

  if (svg) {
    svg.style.display = 'block';
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

function renderStops(arrets) {
  const container = document.getElementById('stopList');
  if (!arrets || arrets.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:24px;"><i class="fa-solid fa-flag" style="font-size:20px;"></i><p style="font-size:12.5px;">Aucun arrêt détecté sur ce trajet.</p></div>`;
    return;
  }
  container.innerHTML = arrets.map(a => `
    <div class="stop-item">
      <span class="stop-marker"></span>
      <div class="stop-info">
        <b>${a.adresse || 'Point d\'arrêt'}</b>
        <span>Arrivée à ${formatHeure(a.heure_arrivee)}</span>
      </div>
      <span class="stop-duree">${formatDuree(a.duree_arret)}</span>
    </div>
  `).join('');
}

function closeDrawer() {
  drawerOverlay.classList.remove('show');
}
drawerClose.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', (e) => {
  if (e.target === drawerOverlay) closeDrawer();
});

document.getElementById('logoutLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  logoutUser();
});

(async function init() {
  const ok = await bootstrapSession();
  if (!ok) return;
  loadHistorique();
})();
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

let drawerLeafletMap = null;

function drawRoute(positions) {
  if (drawerLeafletMap) {
    drawerLeafletMap.remove();
    drawerLeafletMap = null;
  }

  if (!positions || positions.length < 2) return;

  const latLngs = positions.map(p => [p.lat, p.lng]);

  drawerLeafletMap = L.map('drawerMap', {
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(drawerLeafletMap);

  const polyline = L.polyline(latLngs, { color: '#ff7900', weight: 4, opacity: 0.9 }).addTo(drawerLeafletMap);

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

  L.marker(latLngs[0], { icon: greenIcon }).addTo(drawerLeafletMap);
  L.marker(latLngs[latLngs.length - 1], { icon: orangeIcon }).addTo(drawerLeafletMap);

  drawerLeafletMap.fitBounds(polyline.getBounds(), { padding: [20, 20] });

  // essentiel : le drawer est masqué au moment de l'init, Leaflet calcule mal sa taille sans ce recalcul différé
  setTimeout(() => { if (drawerLeafletMap) drawerLeafletMap.invalidateSize(); }, 100);
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
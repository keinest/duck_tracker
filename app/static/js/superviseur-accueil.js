let sessionActive = false;
let sessionStart = null;
let timerInterval = null;
let watchId = null;
let distanceCumulee = 0;
let lastCoords = null;
let lastCoordsTime = null;

let liveMap = null;
let liveMarker = null;
let livePolyline = null;
let routeCoords = [];

const toggleSwitch = document.getElementById('shareToggle');
const shareBtn = document.getElementById('shareBtn');
const statusValue = document.getElementById('statusValue');
const statusDot = document.getElementById('statusDot');
const statusSub = document.getElementById('statusSub');
const sessionTimer = document.getElementById('sessionTimer');
const sessionSince = document.getElementById('sessionSince');
const coordBadge = document.getElementById('coordBadge');
const mapBadgeText = document.getElementById('mapBadgeText');
const statDistance = document.getElementById('statDistance');
const statVitesse = document.getElementById('statVitesse');
const statArrets = document.getElementById('statArrets');
const toast = document.getElementById('toast');
const activityList = document.getElementById('activityList');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function formatDuree(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function addActivity(icon, text, subtext) {
  const empty = activityList.querySelector('.activity-item');
  if (empty && activityList.children.length === 1 && empty.querySelector('p').textContent.includes('Aucune activité')) {
    activityList.innerHTML = '';
  }
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="activity-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="activity-body">
      <p>${text}</p>
      <span>${subtext}</span>
    </div>`;
  activityList.prepend(item);
  while (activityList.children.length > 5) {
    activityList.removeChild(activityList.lastChild);
  }
}

function updateUI(active) {
  sessionActive = active;
  toggleSwitch.checked = active;

  if (active) {
    statusValue.textContent = 'Localisation active';
    statusDot.classList.remove('off');
    statusSub.textContent = 'Votre position est partagée';
    shareBtn.className = 'share-btn stop';
    shareBtn.querySelector('.btn-text').textContent = 'Arrêter le partage';
  } else {
    statusValue.textContent = 'Localisation inactive';
    statusDot.classList.add('off');
    statusSub.textContent = 'Le partage est désactivé';
    mapBadgeText.textContent = 'Position inactive';
    shareBtn.className = 'share-btn start';
    shareBtn.querySelector('.btn-text').textContent = 'Démarrer le partage';
    sessionTimer.textContent = '00:00:00';
    sessionSince.textContent = '—';
    statVitesse.textContent = '0 km/h';
  }
}

function startTimer(startIso) {
  sessionStart = new Date(startIso);
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
    sessionTimer.textContent = formatDuree(Math.max(0, elapsed));
  }, 1000);
  sessionSince.textContent = `Depuis ${sessionStart.getHours().toString().padStart(2, '0')}:${sessionStart.getMinutes().toString().padStart(2, '0')}`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- Carte live ----------
function orangeDivIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#ff7900;border:3px solid #fff;box-shadow:0 0 0 6px rgba(255,121,0,.22);"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function ensureLiveMap(lat, lng) {
  if (liveMap) return;
  liveMap = L.map('liveMap', { zoomControl: false, attributionControl: false }).setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(liveMap);
  liveMarker = L.marker([lat, lng], { icon: orangeDivIcon() }).addTo(liveMap);
  livePolyline = L.polyline(routeCoords.length ? routeCoords : [[lat, lng]], { color: '#ff7900', weight: 4, opacity: 0.85 }).addTo(liveMap);
  setTimeout(() => { if (liveMap) liveMap.invalidateSize(); }, 150);
}

function resetLiveMap() {
  routeCoords = [];
  if (liveMap) {
    liveMap.remove();
    liveMap = null;
    liveMarker = null;
    livePolyline = null;
  }
}

function pushRoutePoint(lat, lng) {
  routeCoords.push([lat, lng]);
  if (!liveMap) {
    ensureLiveMap(lat, lng);
    return;
  }
  liveMarker.setLatLng([lat, lng]);
  livePolyline.setLatLngs(routeCoords);
  // animate:false -> déplacement instantané, plus de décalage perceptible
  liveMap.panTo([lat, lng], { animate: false });
}

function loadInitialRoute(positions) {
  if (!positions || positions.length === 0) return;
  routeCoords = positions.map(p => [p.lat, p.lng]);
  const last = routeCoords[routeCoords.length - 1];
  ensureLiveMap(last[0], last[1]);
  livePolyline.setLatLngs(routeCoords);
  if (routeCoords.length > 1) {
    liveMap.fitBounds(livePolyline.getBounds(), { padding: [20, 20] });
  }
}

// ---------- Géolocalisation ----------
function startGeolocation() {
  if (!navigator.geolocation) {
    showToast("La géolocalisation n'est pas disponible sur cet appareil.");
    return;
  }

  mapBadgeText.textContent = 'Localisation en cours…';

  // 1) Fix rapide et approximatif pour afficher la carte SANS attendre la haute précision
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!liveMap) {
        ensureLiveMap(pos.coords.latitude, pos.coords.longitude);
        mapBadgeText.textContent = 'Position active';
      }
    },
    () => {},
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
  );

  // 2) Suivi continu en haute précision
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const now = Date.now();
      coordBadge.textContent = `${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E`;
      mapBadgeText.textContent = 'Position active';

      // Ignore les positions très imprécises (dérive GPS forte)
      if (accuracy && accuracy > 500) {
        return;
      }

      let vitesseKmh = 0;

      if (lastCoords && lastCoordsTime) {
        const distanceKm = haversine(lastCoords.lat, lastCoords.lng, latitude, longitude);
        const distanceM = distanceKm * 1000;
        const elapsedS = (now - lastCoordsTime) / 1000;

        // Ignore le bruit GPS : en dessous de 3m de déplacement, on considère l'utilisateur immobile
        if (distanceM >= 3 && elapsedS > 0) {
          vitesseKmh = Math.round((distanceM / elapsedS) * 3.6);
          if (distanceKm < 5) {
            distanceCumulee += distanceKm;
            statDistance.textContent = `${distanceCumulee.toFixed(1)} km`;
          }
        } else {
          vitesseKmh = 0;
        }
      }

      statVitesse.textContent = `${vitesseKmh} km/h`;

      lastCoords = { lat: latitude, lng: longitude };
      lastCoordsTime = now;

      pushRoutePoint(latitude, longitude);
      sendPosition(latitude, longitude, vitesseKmh);
    },
    () => showToast("Impossible d'accéder à votre position. Vérifiez les autorisations."),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

function stopGeolocation() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  lastCoords = null;
  lastCoordsTime = null;
}

let lastSent = 0;
let lastSentCoords = null;

function shouldSendPosition(lat, lng) {
  const now = Date.now();
  const timeElapsed = now - lastSent;
  if (timeElapsed >= 10000) return true;
  if (lastSentCoords) {
    const distanceM = haversine(lastSentCoords.lat, lastSentCoords.lng, lat, lng) * 1000;
    if (distanceM >= 8) return true;
  }
  return false;
}

async function sendPosition(lat, lng, vitesse) {
  if (!shouldSendPosition(lat, lng)) return;
  lastSent = Date.now();
  lastSentCoords = { lat, lng };
  try {
    const res = await authFetch('/api/superviseur/position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: lat, longitude: lng, vitesse })
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.nb_arrets === 'number') {
        statArrets.textContent = data.nb_arrets;
      }
    }
  } catch (err) {
    console.error('Envoi position échoué', err);
  }
}

async function checkActiveSession() {
  try {
    const res = await authFetch('/api/superviseur/session/active');
    const data = await res.json();
    if (data.active) {
      updateUI(true);
      startTimer(data.heure_debut);
      loadInitialRoute(data.positions);
      if (typeof data.nb_arrets === 'number') statArrets.textContent = data.nb_arrets;
      startGeolocation();
    } else {
      updateUI(false);
    }
  } catch (err) {
    showToast('Impossible de vérifier votre session.');
  }
}

async function toggleShare() {
  setLoading(true);
  try {
    if (!sessionActive) {
      resetLiveMap();
      const res = await authFetch('/api/superviseur/session/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showToast(data.message || 'Erreur au démarrage'); setLoading(false); return; }
      updateUI(true);
      startTimer(data.heure_debut);
      startGeolocation();
      showToast('Partage de position démarré');
      addActivity('fa-play', 'Partage de position démarré', "À l'instant");
    } else {
      const res = await authFetch('/api/superviseur/session/stop', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showToast(data.message || "Erreur à l'arrêt"); setLoading(false); return; }
      stopGeolocation();
      clearInterval(timerInterval);
      const dureeFinale = sessionTimer.textContent;
      updateUI(false);
      showToast('Partage de position arrêté');
      addActivity('fa-stop', 'Partage de position arrêté', `Durée : ${dureeFinale}`);
    }
  } catch (err) {
    showToast('Impossible de contacter le serveur.');
  }
  setLoading(false);
}

function setLoading(isLoading) {
  shareBtn.classList.toggle('loading', isLoading);
  shareBtn.disabled = isLoading;
}

shareBtn.addEventListener('click', toggleShare);
toggleSwitch.addEventListener('change', () => {
  if (!shareBtn.classList.contains('loading')) toggleShare();
});

document.getElementById('logoutLink').addEventListener('click', (e) => {
  e.preventDefault();
  logoutUser();
});

function renderTodayDate() {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const now = new Date();
  document.getElementById('todayDate').textContent =
    `${jours[now.getDay()]} ${now.getDate()} ${mois[now.getMonth()]} ${now.getFullYear()}`;
}

function renderWeekChart() {
  const jours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const valeurs = [18, 24, 12, 30, 22, 8, 0];
  const max = Math.max(...valeurs, 1);
  const container = document.getElementById('weekChart');
  const todayIndex = (new Date().getDay() + 6) % 7;

  container.innerHTML = valeurs.map((v, i) => `
    <div class="week-bar ${i === todayIndex ? 'today' : ''}">
      <div class="bar" style="height:${Math.max(6, (v / max) * 100)}%" title="${v} km"></div>
      <span class="day-label">${jours[i]}</span>
    </div>
  `).join('');
}

(async function init() {
  renderTodayDate();
  renderWeekChart();

  const ok = await bootstrapSession();
  if (!ok) return;

  if (window.APP_USER) {
    document.getElementById('greeting').textContent = `Bonjour, ${window.APP_USER.prenom}`;
  }

  checkActiveSession();
})();
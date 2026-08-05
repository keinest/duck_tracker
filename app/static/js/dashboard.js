const logoutLink = document.getElementById('logoutLink');
const refreshBtn = document.getElementById('refreshBtn');
const dashboardSubtitle = document.getElementById('dashboardSubtitle');
const countUsers = document.getElementById('countUsers');
const countSuperviseurs = document.getElementById('countSuperviseurs');
const countManagers = document.getElementById('countManagers');
const countActiveSessions = document.getElementById('countActiveSessions');
const countInactive = document.getElementById('countInactive');
const superviseurTable = document.getElementById('superviseurTable');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `${date} ${time}`;
}

function renderStatusDot(active) {
  return `<span class="status-badge ${active ? 'online' : 'offline'}">${active ? 'En ligne' : 'Hors ligne'}</span>`;
}

function renderSuperviseurs(items) {
  if (!items || items.length === 0) {
    superviseurTable.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucun superviseur disponible.</td></tr>`;
    return;
  }

  superviseurTable.innerHTML = items.map(item => `
    <tr>
      <td>${item.prenom} ${item.nom}</td>
      <td>${item.role === 'superviseur' ? 'Superviseur' : item.role.replace('_', ' ')}</td>
      <td>${item.region || '—'}</td>
      <td>${item.statut_compte === 'actif' ? 'Actif' : 'Inactif'}</td>
      <td>${renderStatusDot(item.en_ligne)}</td>
      <td>${formatDateTime(item.derniere_maj)}</td>
    </tr>
  `).join('');
}

async function loadDashboard() {
  dashboardSubtitle.textContent = 'Chargement des statistiques…';
  try {
    const res = await authFetch('/api/manager/dashboard');
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || 'Impossible de charger le tableau de bord.');
      dashboardSubtitle.textContent = 'Erreur de chargement';
      superviseurTable.innerHTML = `<tr><td colspan="6" class="empty-cell">Échec du chargement des données.</td></tr>`;
      return;
    }

    countUsers.textContent = data.total_utilisateurs;
    countSuperviseurs.textContent = data.total_superviseurs;
    countManagers.textContent = data.total_managers;
    countActiveSessions.textContent = data.total_sessions_actives;
    countInactive.textContent = data.total_comptes_inactifs;
    dashboardSubtitle.textContent = `Bonjour ${window.APP_USER ? window.APP_USER.prenom : ''}, voici la synthèse.`;
    renderSuperviseurs(data.superviseurs);
  } catch (err) {
    dashboardSubtitle.textContent = 'Erreur de connexion';
    superviseurTable.innerHTML = `<tr><td colspan="6" class="empty-cell">Impossible de joindre le serveur.</td></tr>`;
    showToast('Impossible de contacter le serveur.');
  }
}

logoutLink?.addEventListener('click', (e) => {
  e.preventDefault();
  logoutUser();
});

refreshBtn?.addEventListener('click', () => loadDashboard());

(async function init() {
  const ok = await bootstrapSession();
  if (!ok) return;
  if (window.APP_USER) {
    dashboardSubtitle.textContent = `Bonjour ${window.APP_USER.prenom}, mise à jour en cours...`;
  }
  await loadDashboard();
})();

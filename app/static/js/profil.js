const profileForm = document.getElementById('profileForm');
const editToggle  = document.getElementById('editToggle');
const cancelEdit  = document.getElementById('cancelEdit');
const formActions = document.getElementById('formActions');
const saveProfile = document.getElementById('saveProfile');

const emailInput  = document.getElementById('emailInput');
const regionInput = document.getElementById('regionInput');

const toast = document.getElementById('toast');
let originalValues = { email: '', region: '' };

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function formatDateFr(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  const jours = ['dim','lun','mar','mer','jeu','ven','sam'];
  return `${jours[d.getDay()]} ${d.getDate()}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} à ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function roleLabel(role) {
  const map = {
    superviseur: 'Superviseur',
    manager_regional: 'Manager régional',
    manager_national: 'Manager national',
    admin: 'Administrateur'
  };
  return map[role] || role;
}

function fillProfile(user) {
  const initiales = `${(user.prenom || '?')[0]}${(user.nom || '?')[0]}`.toUpperCase();
  document.getElementById('avatarInitials').textContent = initiales;
  document.getElementById('profileName').textContent = `${user.prenom} ${user.nom}`;
  document.getElementById('profileRole').textContent = roleLabel(user.role);

  document.getElementById('infoTelephone').textContent = user.telephone || '--';
  document.getElementById('infoEmail').textContent = user.email || 'Non renseigné';
  document.getElementById('infoRegion').textContent = user.region || '--';
  document.getElementById('infoMaj').textContent = formatDateFr(user.derniere_maj);

  emailInput.value = user.email || '';
  regionInput.value = user.region || '';
  originalValues = { email: user.email || '', region: user.region || '' };
}

async function loadProfile() {
  try {
    const res = await authFetch('/api/auth/me');
    const data = await res.json();
    if (res.ok) fillProfile(data);
  } catch (err) {
    showToast('Impossible de charger le profil.');
  }
}

editToggle.addEventListener('click', () => {
  profileForm.classList.add('edit-mode');
  formActions.style.display = 'flex';
  editToggle.style.display = 'none';
});

cancelEdit.addEventListener('click', () => {
  emailInput.value = originalValues.email;
  regionInput.value = originalValues.region;
  profileForm.classList.remove('edit-mode');
  formActions.style.display = 'none';
  editToggle.style.display = 'flex';
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveProfile.classList.add('loading');
  saveProfile.disabled = true;

  try {
    const res = await authFetch('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim(), region: regionInput.value })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || 'Erreur lors de la mise à jour');
    } else {
      fillProfile(data.user);
      profileForm.classList.remove('edit-mode');
      formActions.style.display = 'none';
      editToggle.style.display = 'flex';
      showToast('Profil mis à jour avec succès');
    }
  } catch (err) {
    showToast('Impossible de contacter le serveur.');
  }

  saveProfile.classList.remove('loading');
  saveProfile.disabled = false;
});

// ============ MODAL MOT DE PASSE ============
const passwordModalOverlay = document.getElementById('passwordModalOverlay');
const openPasswordModal    = document.getElementById('openPasswordModal');
const closePasswordModal   = document.getElementById('closePasswordModal');
const passwordForm         = document.getElementById('passwordForm');
const passwordAlert        = document.getElementById('passwordAlert');
const submitPassword       = document.getElementById('submitPassword');

function openModal() {
  passwordModalOverlay.classList.add('show');
}
function closeModal() {
  passwordModalOverlay.classList.remove('show');
  passwordForm.reset();
  passwordAlert.className = 'modal-alert';
  passwordForm.querySelectorAll('.field').forEach(f => f.classList.remove('has-error'));
}

openPasswordModal.addEventListener('click', openModal);
closePasswordModal.addEventListener('click', closeModal);
passwordModalOverlay.addEventListener('click', (e) => {
  if (e.target === passwordModalOverlay) closeModal();
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordAlert.className = 'modal-alert';
  passwordForm.querySelectorAll('.field').forEach(f => f.classList.remove('has-error'));

  const ancien = document.getElementById('ancienMdp').value;
  const nouveau = document.getElementById('nouveauMdp').value;
  const confirmation = document.getElementById('confirmationMdp').value;

  if (nouveau !== confirmation) {
    const field = passwordForm.querySelector('[data-field="confirmation_mdp"]');
    field.classList.add('has-error');
    field.querySelector('.field-error').textContent = 'Les mots de passe ne correspondent pas.';
    return;
  }

  submitPassword.classList.add('loading');
  submitPassword.disabled = true;

  try {
    const res = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ancien_mot_de_passe: ancien, nouveau_mot_de_passe: nouveau })
    });
    const data = await res.json();

    if(!res.ok) {
      passwordAlert.className = 'modal-alert error show';
      passwordAlert.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${data.message}</span>`;
    } 
    else {
      passwordAlert.className = 'modal-alert success show';
      passwordAlert.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>Mot de passe modifié avec succès.</span>`;
      setTimeout(closeModal, 1500);
    }
  } catch (err) {
    passwordAlert.className = 'modal-alert error show';
    passwordAlert.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>Impossible de contacter le serveur.</span>`;
  }

  submitPassword.classList.remove('loading');
  submitPassword.disabled = false;
});

// ============ DECONNEXION ============
document.getElementById('logoutBtn').addEventListener('click', () => logoutUser());
document.getElementById('logoutLinkNav').addEventListener('click', (e) => {
  e.preventDefault();
  logoutUser();
});

(async function init() {
  const ok = await bootstrapSession();
  if (!ok) return;
  loadProfile();
})();
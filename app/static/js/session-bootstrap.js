// Récupère un cookie par son nom (utilisé pour le cookie CSRF du refresh token)
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

window.APP_TOKEN = null;
window.APP_USER = null;

// Appelé au chargement de chaque page protégée : régénère un access token
// à partir du refresh token (cookie httpOnly posé lors du login).
// Si ça échoue, l'utilisateur n'est pas connecté -> retour à la page de connexion.
async function bootstrapSession() {
  try {
    const csrf = getCookie('csrf_refresh_token');
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-TOKEN': csrf } : {}
    });
    if (!res.ok) throw new Error('refresh échoué');
    const data = await res.json();
    window.APP_TOKEN = data.access_token;

    const meRes = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${window.APP_TOKEN}` }
    });
    if (meRes.ok) window.APP_USER = await meRes.json();

    return true;
  } catch (err) {
    window.location.href = '/auth/connexion';
    return false;
  }
}

// Wrapper fetch qui ajoute automatiquement le token d'authentification
function authFetch(url, options = {}) {
  options.headers = Object.assign({}, options.headers, {
    'Authorization': `Bearer ${window.APP_TOKEN}`
  });
  options.credentials = 'include';
  return fetch(url, options);
}

async function logoutUser() {
  const csrf = getCookie('csrf_refresh_token');
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: csrf ? { 'X-CSRF-TOKEN': csrf } : {}
  });
  window.location.href = '/';
}

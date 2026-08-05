function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

window.APP_TOKEN = null;
window.APP_USER = null;

async function silentRefresh() {
  try {
    const csrf = getCookie('csrf_refresh_token');
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-TOKEN': csrf } : {}
    });
    if (!res.ok) return false;
    const data = await res.json();
    window.APP_TOKEN = data.access_token;
    return true;
  } catch (err) {
    return false;
  }
}

// Appelé une seule fois au chargement de page
async function bootstrapSession() {
  const ok = await silentRefresh();
  if (!ok) {
    window.location.href = '/auth/connexion';
    return false;
  }
  try {
    const meRes = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${window.APP_TOKEN}` }
    });
    if (meRes.ok) window.APP_USER = await meRes.json();
  } catch (err) { /* non bloquant */ }
  return true;
}

// Wrapper fetch avec retry automatique sur expiration de token (401)
async function authFetch(url, options = {}, isRetry = false) {
  options.headers = Object.assign({}, options.headers, {
    'Authorization': `Bearer ${window.APP_TOKEN}`
  });
  options.credentials = 'include';

  const res = await fetch(url, options);

  if (res.status === 401 && !isRetry) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      return authFetch(url, options, true); // un seul retry, transparent
    }
    window.location.href = '/auth/connexion';
  }

  return res;
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
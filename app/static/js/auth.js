// ============ TOGGLE MOT DE PASSE ============
document.querySelectorAll('.toggle-pass').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const icon = btn.querySelector('i');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.classList.toggle('fa-eye');
    icon.classList.toggle('fa-eye-slash');
  });
});

// ============ HELPERS ============
function showAlert(el, type, message) {
  el.className = `form-alert ${type} show`;
  el.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${message}</span>`;
}

function hideAlert(el) {
  el.className = 'form-alert';
  el.innerHTML = '';
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field').forEach(f => {
    f.classList.remove('has-error');
    const err = f.querySelector('.field-error');
    if (err) err.textContent = '';
  });
}

function setFieldError(form, fieldName, message) {
  const field = form.querySelector(`[data-field="${fieldName}"]`);
  if (!field) return;
  field.classList.add('has-error');
  const err = field.querySelector('.field-error');
  if (err) err.textContent = message;
}

function setLoading(button, isLoading) {
  button.classList.toggle('loading', isLoading);
  button.disabled = isLoading;
}

// ============ LOGIN ============
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const alertEl = document.getElementById('formAlert');
  const submitBtn = document.getElementById('submitBtn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertEl);
    clearFieldErrors(loginForm);
    setLoading(submitBtn, true);

    const payload = {
      telephone: loginForm.telephone.value.trim(),
      mot_de_passe: loginForm.mot_de_passe.value
    };

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert(alertEl, 'error', data.message || "Une erreur est survenue.");
        setLoading(submitBtn, false);
        return;
      }

      // Access token gardé en mémoire pour la session en cours.
      // Le refresh token est déjà posé en cookie httpOnly par le serveur.
      window.__ACCESS_TOKEN__ = data.access_token;

      showAlert(alertEl, 'success', `Bienvenue, ${data.user.prenom} — redirection en cours…`);

      const role = data.user.role;
      let destination = '/superviseur/accueil';
      if (role === 'manager_regional' || role === 'manager_national' || role === 'admin') {
        destination = '/manager/dashboard';
      }

      setTimeout(() => { window.location.href = destination; }, 900);

    } catch (err) {
      showAlert(alertEl, 'error', "Impossible de contacter le serveur. Vérifiez votre connexion.");
      setLoading(submitBtn, false);
    }
  });
}

// ============ REGISTER ============
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  const alertEl = document.getElementById('formAlert');
  const submitBtn = document.getElementById('submitBtn');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertEl);
    clearFieldErrors(registerForm);

    const motDePasse = registerForm.mot_de_passe.value;
    const confirmation = registerForm.confirmation.value;

    if (motDePasse !== confirmation) {
      setFieldError(registerForm, 'confirmation', 'Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(submitBtn, true);

    const payload = {
      nom: registerForm.nom.value.trim(),
      prenom: registerForm.prenom.value.trim(),
      telephone: registerForm.telephone.value.trim(),
      email: registerForm.email.value.trim() || null,
      region: registerForm.region.value,
      mot_de_passe: motDePasse
    };

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.erreurs) {
          Object.entries(data.erreurs).forEach(([field, messages]) => {
            setFieldError(registerForm, field, Array.isArray(messages) ? messages[0] : messages);
          });
          showAlert(alertEl, 'error', 'Corrigez les champs indiqués ci-dessous.');
        } else {
          showAlert(alertEl, 'error', data.message || "Une erreur est survenue.");
        }
        setLoading(submitBtn, false);
        return;
      }

      showAlert(alertEl, 'success', 'Compte créé avec succès — redirection vers la connexion…');
      setTimeout(() => { window.location.href = '/auth/connexion'; }, 1200);

    } catch (err) {
      showAlert(alertEl, 'error', "Impossible de contacter le serveur. Vérifiez votre connexion.");
      setLoading(submitBtn, false);
    }
  });
}

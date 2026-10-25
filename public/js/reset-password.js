// js/reset-password.js — Página de restablecimiento de contraseña.
// Supabase envía un enlace con los tokens en el hash (#access_token=...).
// Este script los valida, muestra el formulario y actualiza la contraseña.

const RESET_PASSWORD_MIN_LENGTH = 8;
let resetAccessToken = null;

document.addEventListener('DOMContentLoaded', initResetPage);

function setResetStatus(message, isError) {
  const status = document.getElementById('resetStatus');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('is-error', Boolean(isError));
}

function showResetForm(email) {
  const form = document.getElementById('resetForm');
  const intro = document.getElementById('resetIntro');
  const emailEl = document.getElementById('resetEmail');

  if (emailEl) emailEl.textContent = email || '';
  if (intro) intro.hidden = true;
  if (form) form.hidden = false;

  const firstInput = document.getElementById('resetPassword');
  if (firstInput) firstInput.focus();
}

function showResetInvalid(message) {
  const invalid = document.getElementById('resetInvalid');
  const form = document.getElementById('resetForm');
  const intro = document.getElementById('resetIntro');

  if (form) form.hidden = true;
  if (intro) intro.hidden = true;

  if (invalid) {
    const text = invalid.querySelector('.reset-invalid-text');
    if (text) text.textContent = message || 'El enlace no es válido o ya expiró.';
    invalid.hidden = false;
  }

  setResetStatus('');
}

async function initResetPage() {
  const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const errorDescription = hash.get('error_description');

  if (errorDescription) {
    showResetInvalid(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
    return;
  }

  const accessToken = hash.get('access_token');
  const type = hash.get('type');

  if (!accessToken || type !== 'recovery') {
    showResetInvalid('Este enlace no es válido o ya fue usado. Pide uno nuevo desde el panel.');
    return;
  }

  // Quita los tokens de la barra de direcciones y del historial.
  window.history.replaceState(null, '', window.location.pathname);

  try {
    const user = await supabaseRequest('/auth/v1/user', { token: accessToken });
    resetAccessToken = accessToken;
    showResetForm(user && user.email ? user.email : '');
  } catch (error) {
    console.error('[reset]', error);
    showResetInvalid('El enlace expiró o no es válido. Pide uno nuevo desde el panel.');
  }
}

async function handleResetSubmit(event) {
  event.preventDefault();

  const password = document.getElementById('resetPassword').value;
  const confirmation = document.getElementById('resetConfirm').value;

  if (!resetAccessToken) {
    showResetInvalid('El enlace expiró. Pide uno nuevo desde el panel.');
    return;
  }

  if (password.length < RESET_PASSWORD_MIN_LENGTH) {
    setResetStatus(`La contraseña debe tener al menos ${RESET_PASSWORD_MIN_LENGTH} caracteres.`, true);
    return;
  }

  if (password !== confirmation) {
    setResetStatus('Las contraseñas no coinciden.', true);
    return;
  }

  const submit = document.getElementById('resetSubmit');
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Guardando…';
  }

  try {
    await supabaseRequest('/auth/v1/user', {
      method: 'PUT',
      token: resetAccessToken,
      body: { password }
    });

    const form = document.getElementById('resetForm');
    if (form) form.hidden = true;
    document.getElementById('resetSuccess').hidden = false;
    setResetStatus('');
    resetAccessToken = null;
  } catch (error) {
    console.error('[reset]', error);
    setResetStatus(error.message || 'No se pudo actualizar la contraseña.', true);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Guardar contraseña';
    }
  }
}

document.addEventListener('submit', (event) => {
  if (event.target && event.target.id === 'resetForm') handleResetSubmit(event);
});

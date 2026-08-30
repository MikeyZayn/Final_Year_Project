import { appState, demoCredentials } from './state.mjs';
import { selectLoginRole, switchScreen } from './ui.mjs';
import { setupDashboardView } from './dashboard.mjs';
import { showNotification } from './notifications.mjs';

export function handleRegisterSubmit(event) {
  event.preventDefault();

  if (appState.currentRegRole === 'driver' || appState.currentRegRole === 'operator') {
    appState.pendingAccountType = appState.currentRegRole;
    const otpModal = document.getElementById('otpModal');
    if (otpModal) otpModal.classList.remove('hidden');
  } else {
    showNotification(`Account registered for ${appState.currentRegRole.toUpperCase()}!`, 'success');
    setTimeout(() => {
      setupDashboardView(appState.currentRegRole, 'Verified User', false);
      switchScreen('screenDashboard');
    }, 800);
  }
}

export function confirmOTP() {
  const otpModal = document.getElementById('otpModal');
  if (otpModal) otpModal.classList.add('hidden');

  showNotification('OTP Verified! Sent to Administrator for approval within 24h.', 'info');
  setTimeout(() => {
    setupDashboardView(appState.pendingAccountType, `${appState.pendingAccountType.toUpperCase()} (Pending)`, true);
    switchScreen('screenDashboard');
  }, 800);
}

export function fillDemo(role) {
  selectLoginRole(role);
  const idInput = document.getElementById('loginIdentifier');
  const passInput = document.getElementById('loginPassword');

  const demo = demoCredentials[role];
  if (demo && idInput && passInput) {
    idInput.value = demo.identifier;
    passInput.value = demo.password;
  }

  showNotification(`Filled Demo Credentials for ${role.toUpperCase()}`, 'info');
}

export function handleLoginSubmit(event) {
  event.preventDefault();
  const idInput = document.getElementById('loginIdentifier');
  if (!idInput) return;

  const id = idInput.value;
  showNotification(`Signing in as ${appState.currentRole.toUpperCase()}...`, 'success');

  setTimeout(() => {
    const isPending = (appState.currentRole === 'driver' || appState.currentRole === 'operator') && id.includes('PENDING');
    setupDashboardView(appState.currentRole, id, isPending);
    switchScreen('screenDashboard');
  }, 600);
}

export function loginAsGuest() {
  showNotification('Continuing in Guest Mode (Read-Only Information)', 'info');
  setTimeout(() => {
    setupDashboardView('passenger', 'Guest Commuter', false);
    switchScreen('screenDashboard');
  }, 500);
}

export function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);

  if (!input || !icon) return;

  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash text-xs';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye text-xs';
  }
}

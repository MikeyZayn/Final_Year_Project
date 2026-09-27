import { updateLiveTime, switchScreen, toggleDisplayMode, selectLoginRole, selectRegisterRole, renderDynamicRegFields } from './ui.mjs';
import { handleRegisterSubmit, confirmOTP, fillDemo, handleLoginSubmit, loginAsGuest, togglePasswordVisibility } from './auth.mjs';
import { setupDashboardView, approveAccount, rejectAccount } from './dashboard.mjs';
import { showNotification } from './notifications.mjs';

window.switchScreen = switchScreen;
window.toggleDisplayMode = toggleDisplayMode;
window.selectLoginRole = selectLoginRole;
window.selectRegisterRole = selectRegisterRole;
window.renderDynamicRegFields = renderDynamicRegFields;
window.handleRegisterSubmit = handleRegisterSubmit;
window.confirmOTP = confirmOTP;
window.fillDemo = fillDemo;
window.handleLoginSubmit = handleLoginSubmit;
window.loginAsGuest = loginAsGuest;
window.setupDashboardView = setupDashboardView;
window.approveAccount = approveAccount;
window.rejectAccount = rejectAccount;
window.togglePasswordVisibility = togglePasswordVisibility;
window.showNotification = showNotification;

window.logout = () => {
  showNotification('Logged out successfully', 'info');
  switchScreen('screenSplash');
};

document.addEventListener('DOMContentLoaded', () => {
  updateLiveTime();
  setInterval(updateLiveTime, 30000);
  renderDynamicRegFields('passenger');
});

import { appState } from './state.mjs';
import { showNotification } from './notifications.mjs';

export function setupDashboardView(role, userLabel, isPending = false) {
  const avatar = document.getElementById('dashAvatar');
  const nameElem = document.getElementById('dashUserName');
  const roleElem = document.getElementById('dashUserRole');
  const container = document.getElementById('roleDashboardContent');
  const pendingBanner = document.getElementById('pendingApprovalBanner');
  const statusBadge = document.getElementById('accountStatusBadge');

  if (!avatar || !nameElem || !roleElem || !container || !pendingBanner || !statusBadge) {
    return;
  }

  const safeLabel = userLabel || 'Verified User';
  nameElem.textContent = safeLabel;
  roleElem.textContent = role.toUpperCase();
  avatar.textContent = safeLabel.substring(0, 2).toUpperCase();

  if (isPending) {
    pendingBanner.classList.remove('hidden');
    statusBadge.className = 'text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 font-mono';
    statusBadge.innerHTML = '<i class="fa-solid fa-clock"></i> Pending Approval';
  } else {
    pendingBanner.classList.add('hidden');
    statusBadge.className = 'text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono';
    statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Active / Verified';
  }

  let html = '';

  if (role === 'passenger') {
    html = `
      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
        <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs">
          <i class="fa-solid fa-magnifying-glass"></i>
          <span>Search Fares & Schedules</span>
        </div>
        <p class="text-[11px] text-slate-400">View verified fares for PMB, Durban, Richards Bay, and KwaDlangezwa routes.</p>
      </div>
      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
        <div class="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
          <i class="fa-solid fa-qrcode"></i>
          <span>Trip Verification Codes</span>
        </div>
        <p class="text-[11px] text-slate-400">Single-use boarding code (e.g., 7F3Q 9K2L) confirms participation for trusted feedback.</p>
      </div>
    `;
  } else if (role === 'driver') {
    html = `
      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
        <div class="flex items-center justify-between text-emerald-400 font-bold text-xs">
          <span class="flex items-center gap-2"><i class="fa-solid fa-van-shuttle"></i> Active Trip Manifest</span>
          <span class="text-[10px] text-slate-400 font-mono">Assigned per trip</span>
        </div>
        <p class="text-[11px] text-slate-400">Vehicle: Toyota Quantum (ND 123-456) matched to driver for PMB ➔ Durban trip.</p>
      </div>
    `;
  } else if (role === 'operator') {
    html = `
      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between text-blue-400 font-bold text-xs">
          <span><i class="fa-solid fa-building-user mr-1"></i> Operator Trip & Vehicle Linkage</span>
        </div>
        <p class="text-[11px] text-slate-400">Assign verified drivers to cleared vehicles per-trip to prevent unauthorized vehicle swapping.</p>
      </div>
    `;
  } else if (role === 'admin') {
    html = `
      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between text-amber-400 font-bold text-xs">
          <span><i class="fa-solid fa-user-clock mr-1"></i> Driver & Operator Approvals</span>
          <span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono">${appState.pendingApprovalsList.length} Pending</span>
        </div>
        <div id="adminApprovalContainer" class="space-y-1.5 text-[11px]">
          ${renderAdminApprovalList()}
        </div>
      </div>

      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div class="flex items-center space-x-2 text-purple-400 font-bold text-xs">
          <i class="fa-solid fa-scale-balanced"></i>
          <span>Complaint Review</span>
        </div>
        <div class="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300 flex justify-between items-center">
          <div>
            <span class="font-bold text-amber-400 block">Report #8802 - Reckless Overtaking</span>
          </div>
          <button onclick="showNotification('Complaint marked as Confirmed Safety Incident', 'success')" class="px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-white text-[9px] font-bold">
            Review
          </button>
        </div>
      </div>

      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div class="flex items-center text-rose-400 font-bold text-xs">
          <span><i class="fa-solid fa-user-slash mr-1"></i> Account Governance </span>
        </div>
        <p class="text-[10px] text-slate-400">Archive or disable problematic accounts.</p>
      </div>
    `;
  }

  container.innerHTML = html;
}

export function renderAdminApprovalList() {
  if (appState.pendingApprovalsList.length === 0) {
    return '<p class="text-slate-500 text-[10px] text-center py-1">No pending accounts awaiting approval.</p>';
  }

  return appState.pendingApprovalsList.map((item) => `
    <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
      <div>
        <span class="font-bold text-white block">${item.type}: ${item.identifier}</span>
        <span class="text-slate-400 text-[9px]">Rank: ${item.rankCode} | Tel: ${item.phone}</span>
      </div>
      <div class="flex space-x-1">
        <button onclick="approveAccount(${item.id})" class="px-2 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[9px] font-bold">Approve</button>
        <button onclick="rejectAccount(${item.id})" class="px-2 py-1 rounded bg-rose-500 hover:bg-rose-400 text-white text-[9px] font-bold">Reject</button>
      </div>
    </div>
  `).join('');
}

export function approveAccount(id) {
  appState.pendingApprovalsList = appState.pendingApprovalsList.filter((item) => item.id !== id);
  showNotification('Account approved successfully!', 'success');

  const adminApprovalContainer = document.getElementById('adminApprovalContainer');
  if (adminApprovalContainer) {
    adminApprovalContainer.innerHTML = renderAdminApprovalList();
  }
}

export function rejectAccount(id) {
  appState.pendingApprovalsList = appState.pendingApprovalsList.filter((item) => item.id !== id);
  showNotification('Account rejected and notified.', 'error');

  const adminApprovalContainer = document.getElementById('adminApprovalContainer');
  if (adminApprovalContainer) {
    adminApprovalContainer.innerHTML = renderAdminApprovalList();
  }
}

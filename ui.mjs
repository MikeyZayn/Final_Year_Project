import { appState, roles } from './state.mjs';

export function updateLiveTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeElem = document.getElementById('liveTime');
  if (timeElem) timeElem.textContent = `${hours}:${minutes}`;
}

export function switchScreen(screenId) {
  const screens = ['screenSplash', 'screenLogin', 'screenRegister', 'screenDashboard'];
  screens.forEach((id) => {
    const elem = document.getElementById(id);
    if (elem) {
      if (id === screenId) {
        elem.classList.remove('hidden');
        elem.classList.add('fade-in');
      } else {
        elem.classList.add('hidden');
        elem.classList.remove('fade-in');
      }
    }
  });
}

export function toggleDisplayMode() {
  const container = document.getElementById('appContainer');
  const notch = document.getElementById('phoneNotch');
  const btnText = document.getElementById('viewBtnText');

  if (!container || !notch || !btnText) {
    return;
  }

  if (appState.isPhoneFrameView) {
    container.classList.remove('phone-frame');
    container.classList.add('w-full', 'max-w-xl', 'h-[780px]', 'rounded-3xl', 'border-slate-800', 'shadow-2xl');
    notch.classList.add('hidden');
    btnText.textContent = 'Switch to Mobile Frame Mode';
    appState.isPhoneFrameView = false;
  } else {
    container.classList.add('phone-frame');
    container.classList.remove('w-full', 'max-w-xl', 'rounded-3xl', 'shadow-2xl');
    notch.classList.remove('hidden');
    btnText.textContent = 'Switch to Desktop View';
    appState.isPhoneFrameView = true;
  }
}

export function selectLoginRole(role) {
  appState.currentRole = role;

  roles.forEach((r) => {
    const btn = document.getElementById(`loginRole-${r}`);
    if (btn) {
      if (r === role) {
        btn.className = 'login-role-btn py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold transition';
      } else {
        btn.className = 'login-role-btn py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition';
      }
    }
  });
}

export function selectRegisterRole(role) {
  appState.currentRegRole = role;

  roles.forEach((r) => {
    const card = document.getElementById(`regCard-${r}`);
    if (!card) return;

    if (r === role) {
      card.className = 'reg-role-card p-2.5 rounded-xl border border-amber-500 bg-amber-500/10 cursor-pointer transition flex items-center space-x-2';
      const iconWrap = card.querySelector('div');
      if (iconWrap) {
        iconWrap.className = 'w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs';
      }
    } else {
      card.className = 'reg-role-card p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 cursor-pointer transition flex items-center space-x-2';
      const iconWrap = card.querySelector('div');
      if (iconWrap) {
        iconWrap.className = 'w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs';
      }
    }
  });

  renderDynamicRegFields(role);
}

export function renderDynamicRegFields(role) {
  const container = document.getElementById('dynamicFieldsContainer');
  if (!container) return;

  let html = '';

  if (role === 'passenger') {
    html = `
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-medium text-slate-300 mb-1">First Name *</label>
          <input type="text" id="regFName" required placeholder="Sibusiso" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-medium text-slate-300 mb-1">Surname *</label>
          <input type="text" id="regLName" required placeholder="Dlamini" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
        </div>
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Cellphone Number *</label>
        <input type="tel" id="regPhone" required placeholder="082 123 4567" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-medium text-slate-300 mb-1">Alt Phone (Optional)</label>
          <input type="tel" placeholder="071 000 0000" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-medium text-slate-300 mb-1">Email (Optional)</label>
          <input type="email" placeholder="name@domain.co.za" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
        </div>
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Emergency Contact Name *</label>
        <input type="text" required placeholder="Nqobile Zondo" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Emergency Contact Cellphone Number *</label>
        <input type="tel" required placeholder="071 234 5678" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Relationship to Passenger *</label>
        <input type="text" required placeholder="Mother / Brother / Spouse" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
    `;
  } else if (role === 'driver') {
    html = `
      <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 mb-1">
        <i class="fa-solid fa-circle-info mr-1"></i> Drivers are linked to vehicles per-trip by operators.
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Cellphone Number *</label>
        <input type="tel" id="regPhone" required placeholder="073 987 6543" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Email Address *</label>
        <input type="email" required placeholder="driver@transport.co.za" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Driver License Number (PDP) *</label>
        <input type="text" required placeholder="DL-89012345" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs font-mono">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Assigned Taxi Association / Rank Code *</label>
        <input type="text" required placeholder="e.g. PMB-RANK-01" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs uppercase">
      </div>
    `;
  } else if (role === 'operator') {
    html = `
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Cellphone Number *</label>
        <input type="tel" id="regPhone" required placeholder="081 555 9922" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Email Address *</label>
        <input type="email" required placeholder="operator@association.co.za" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Admin-Issued Operator Rank Code *</label>
        <input type="text" required placeholder="e.g. OP-KZN-004" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs font-mono uppercase">
        <p class="text-[9px] text-slate-400 mt-0.5">Unique rank code issued by system administrator.</p>
      </div>
    `;
  } else if (role === 'admin') {
    html = `
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-medium text-slate-300 mb-1">First Name *</label>
          <input type="text" id="regFName" required placeholder="Admin Name" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-medium text-slate-300 mb-1">Surname *</label>
          <input type="text" id="regLName" required placeholder="Admin Surname" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
        </div>
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Cellphone Number *</label>
        <input type="tel" id="regPhone" required placeholder="082 123 4567" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Oversight Institution / University *</label>
        <input type="text" required placeholder="e.g. UNIZULU Inspectorate" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
      <div>
        <label class="block text-[10px] font-medium text-slate-300 mb-1">Admin Authorization Passcode *</label>
        <input type="password" required placeholder="Enter secret passcode" class="w-full px-2.5 py-1.5 rounded-xl glass-input text-xs">
      </div>
    `;
  }

  container.innerHTML = html;
}

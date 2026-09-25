export function showNotification(message, type = 'info') {
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast || !toastMsg || !toastIcon) {
    return;
  }

  toastMsg.textContent = message;

  if (type === 'success') {
    toastIcon.className = 'w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0';
    toastIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  } else if (type === 'error') {
    toastIcon.className = 'w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0';
    toastIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
  } else {
    toastIcon.className = 'w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0';
    toastIcon.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
  }

  toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');

  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
  }, 3000);
}

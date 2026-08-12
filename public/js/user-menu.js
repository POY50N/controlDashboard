// Turns the "logged-in user" area into a menu button. Used by both the
// admin sidebar (opens upward) and the client portal header (opens down).
(() => {
  function wire(triggerId, menuId) {
    const trigger = document.getElementById(triggerId);
    const menu = document.getElementById(menuId);
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !willOpen);
      trigger.classList.toggle('open', willOpen);
    });

    document.addEventListener('click', (e) => {
      if (menu.classList.contains('hidden')) return;
      if (menu.contains(e.target) || trigger.contains(e.target)) return;
      menu.classList.add('hidden');
      trigger.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { menu.classList.add('hidden'); trigger.classList.remove('open'); }
    });
  }

  window.wireUserMenu = wire;
  document.addEventListener('DOMContentLoaded', () => wire('userTrigger', 'userMenu'));
  if (document.readyState !== 'loading') wire('userTrigger', 'userMenu');
})();

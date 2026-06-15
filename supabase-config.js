// V4 cloud sync config
// The anon key is public by design; Supabase RLS policies protect user data.
window.SUPABASE_URL = 'https://ncxpaztivbgsiyzysphd.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHBhenRpdmJnc2l5enlzcGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTM1NDIsImV4cCI6MjA5NzA4OTU0Mn0.2LqMSGP5IGufGAafJjoRNAdp749qphAnlA2qStTJHDc';

// Restore older cloud saves before revealing the authenticated app.
document.addEventListener('DOMContentLoaded', () => {
  const repairScript = document.createElement('script');
  repairScript.src = './session-repair.js?v=1';
  document.body.appendChild(repairScript);

  const restoreLoggedInView = () => {
    const accountButton = document.getElementById('accountBtn');
    const accountPanel = document.getElementById('accountPanel');
    const isLoggedInView = accountButton &&
      !accountButton.classList.contains('hidden') &&
      accountPanel?.classList.contains('hidden');

    if (!isLoggedInView) return;

    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('auth-locked');
    });
    document.querySelector('.bottom-nav')?.classList.remove('hidden');
  };

  const observer = new MutationObserver(restoreLoggedInView);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true
  });
  restoreLoggedInView();
});

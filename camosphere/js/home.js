// ═══════════════════════════════════════
//  home.js — Home Page logic
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {

  // 1. Fade in welcome section
  const welcomeSection = document.getElementById('welcome-section');
  setTimeout(function () { welcomeSection.classList.add('visible'); }, 100);

  // 2. Neon box animation
  const bluePath = document.getElementById('blue-path');
  const redPath  = document.getElementById('red-path');

  function drawBox() {
    bluePath.style.strokeDashoffset = '0';
    redPath.style.strokeDashoffset  = '0';
    setTimeout(function () {
      bluePath.style.strokeDashoffset = '700';
      redPath.style.strokeDashoffset  = '700';
      setTimeout(drawBox, 5000);
    }, 5000);
  }
  setTimeout(drawBox, 1000);

  // 3. Get Started button
  const getStartedBtn = document.getElementById('get-started-btn');
  const roleSelection = document.getElementById('role-selection');
  getStartedBtn.addEventListener('click', function () {
    getStartedBtn.classList.add('hidden');
    roleSelection.classList.remove('hidden');
  });

  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get('next');

  if (params.get('loginRequired') === '1') {
    getStartedBtn.classList.add('hidden');
    roleSelection.classList.remove('hidden');
    roleSelection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (requestedPage) {
    document.querySelectorAll('.role-card').forEach(function (card) {
      const href = card.getAttribute('href');
      const url = new URL(href, window.location.href);
      url.searchParams.set('next', requestedPage);
      card.setAttribute('href', url.pathname.split('/').pop() + url.search);
    });
  }

  // 4. Feature cards stagger
  document.querySelectorAll('.feature-card').forEach(function (card, i) {
    card.style.animationDelay = (i * 0.1) + 's';
  });

});

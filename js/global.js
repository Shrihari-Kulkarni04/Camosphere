// global.js - shared navigation, session, and route protection

const Session = {
  set: function (key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
  },
  get: function (key) {
    try {
      return JSON.parse(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  },
  clear: function () {
    sessionStorage.clear();
  },
  isLoggedIn: function () {
    return !!sessionStorage.getItem('user');
  }
};

const PROTECTED_PAGES = [
  'dashboard.html',
  'virtual-tour.html',
  'departments.html',
  'campus-map.html',
  'events.html',
  'guava-ai.html'
];

const LOGIN_PAGES = [
  'student-login.html',
  'teacher-login.html',
  'visitor-login.html',
  'admin-login.html'
];

const SIDEBAR_NAV_ITEMS = [
  { label: 'Home', href: 'index.html', icon: '&#127968;', home: true, public: true },
  { label: 'Dashboard', href: 'dashboard.html', icon: '&#128202;', protected: true },
  { label: 'Virtual Tour', href: 'virtual-tour.html', icon: '&#129405;', protected: true, public: true },
  { label: 'Departments', href: 'departments.html', icon: '&#127963;&#65039;', protected: true, public: true },
  { label: 'Campus Map', href: 'campus-map.html', icon: '&#128506;&#65039;', protected: true, public: true },
  { label: 'Events', href: 'events.html', icon: '&#128197;', protected: true, public: true },
  { label: 'Guava AI', href: 'guava-ai.html', icon: '&#129302;', protected: true, public: true },
  { label: 'Logout', href: 'index.html', icon: '&#128682;', logout: true }
];

const currentFile = window.location.pathname.split('/').pop() || 'index.html';

function loginUrl(nextPage) {
  const url = new URL('index.html', window.location.href);
  url.searchParams.set('loginRequired', '1');

  if (nextPage && PROTECTED_PAGES.includes(nextPage)) {
    url.searchParams.set('next', nextPage);
  }

  return url.pathname.split('/').pop() + url.search;
}

function isPageRefresh() {
  const navEntry = performance.getEntriesByType &&
    performance.getEntriesByType('navigation')[0];

  if (navEntry) {
    return navEntry.type === 'reload';
  }

  return performance.navigation && performance.navigation.type === 1;
}

function protectCurrentPage() {
  if (currentFile !== 'index.html' && isPageRefresh()) {
    Session.clear();
    window.location.replace('index.html');
    return;
  }

  if (!PROTECTED_PAGES.includes(currentFile)) return;

  if (!Session.isLoggedIn()) {
    window.location.replace(loginUrl(currentFile));
  }
}

function sidebarItemsForCurrentPage() {
  if (currentFile === 'index.html' || LOGIN_PAGES.includes(currentFile)) {
    return SIDEBAR_NAV_ITEMS.filter(function (item) {
      return item.public;
    });
  }

  return SIDEBAR_NAV_ITEMS;
}

function renderSidebarNav() {
  const navList = document.querySelector('.sidebar-nav ul');
  if (!navList) return;

  navList.innerHTML = sidebarItemsForCurrentPage().map(function (item) {
    const active = item.href === currentFile ? ' active' : '';
    const logoutAttr = item.logout ? ' data-logout="true"' : '';
    const homeAttr = item.home ? ' data-home="true"' : '';

    return [
      '<li>',
      '<a href="' + item.href + '" class="nav-btn' + active + '"' + logoutAttr + homeAttr + '>',
      '<span class="nav-icon">' + item.icon + '</span>',
      '<span class="nav-label">' + item.label + '</span>',
      '</a>',
      '</li>'
    ].join('');
  }).join('');
}

function renderSidebarFooter() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer) return;

  footer.innerHTML = '<p>&copy; 2026</p><p>Developed by Team Camosphere</p>';
}

function wireSidebarNavigation() {
  document.querySelectorAll('.nav-btn').forEach(function (link) {
    const href = link.getAttribute('href');
    const targetFile = href ? href.split('?')[0].split('#')[0] : '';

    if (link.dataset.home === 'true') {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        Session.clear();
        window.location.href = 'index.html';
      });
      return;
    }

    if (link.dataset.logout === 'true') {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        Session.clear();
        window.location.href = 'index.html';
      });
      return;
    }

    if (!PROTECTED_PAGES.includes(targetFile)) return;

    link.addEventListener('click', function (e) {
      if (Session.isLoggedIn()) return;

      e.preventDefault();
      window.location.href = loginUrl(targetFile);
    });
  });
}

function wireSidebarLogo() {
  const logo = document.querySelector('.sidebar-logo');
  if (!logo) return;

  logo.addEventListener('click', function () {
    Session.clear();
    window.location.href = 'index.html';
  });
}

function setupResponsiveSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  let toggle = document.querySelector('.sidebar-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sidebar-toggle';
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.setAttribute('aria-controls', 'sidebar');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    document.body.insertBefore(toggle, document.body.firstChild);
  }

  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const mobileQuery = window.matchMedia('(max-width: 768px)');

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
  }

  function toggleSidebar() {
    const isOpen = document.body.classList.toggle('sidebar-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  }

  toggle.addEventListener('click', toggleSidebar);
  backdrop.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });

  document.querySelectorAll('.nav-btn').forEach(function (link) {
    link.addEventListener('click', function () {
      if (mobileQuery.matches) {
        closeSidebar();
      }
    });
  });

  window.addEventListener('resize', function () {
    if (!mobileQuery.matches) {
      closeSidebar();
    }
  });
}

protectCurrentPage();

document.addEventListener('DOMContentLoaded', function () {
  renderSidebarNav();
  renderSidebarFooter();
  wireSidebarNavigation();
  wireSidebarLogo();
  setupResponsiveSidebar();

  if (LOGIN_PAGES.includes(currentFile) && Session.isLoggedIn()) {
    Session.clear();
  }
});

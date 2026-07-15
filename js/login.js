// login.js - Supabase-backed login and registration pages

document.addEventListener('DOMContentLoaded', function () {
  const loginBox = document.querySelector('.login-box');
  const role = loginBox ? loginBox.dataset.role : null;
  const db = window.CamosphereSupabase;

  const modeBtns = document.getElementById('mode-btns');
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');

  setupPasswordToggles();

  if (!db) {
    showMsg(document.querySelector('.msg'), 'Supabase config is not loaded. Check script order.', 'error');
    return;
  }

  if (modeBtns) {
    modeBtns.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const mode = btn.dataset.mode;
        if (mode === 'new') {
          registerForm.classList.remove('hidden');
          loginForm.classList.add('hidden');
        } else {
          loginForm.classList.remove('hidden');
          registerForm.classList.add('hidden');
        }
      });
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const msgEl = document.getElementById('register-msg');
      const formData = Object.fromEntries(new FormData(registerForm));

      if (!formData.name || !formData.course || !formData.branch || !formData.semester) {
        showMsg(msgEl, 'Please fill all fields.', 'error');
        return;
      }

      setBusy(registerForm, true);
      showMsg(msgEl, 'Saving registration...', 'success');

      const { error } = await db.insert(db.tables.newStudent, {
        name: formData.name,
        course: formData.course,
        branch: formData.branch,
        semester: formData.semester
      });

      setBusy(registerForm, false);

      if (error) {
        showMsg(msgEl, cleanSupabaseError(error), 'error');
        return;
      }

      Session.set('user', {
        role: 'student',
        name: formData.name,
        course: formData.course,
        branch: formData.branch,
        semester: formData.semester,
        status: 'new'
      });

      showMsg(msgEl, 'Registration saved! Redirecting...', 'success');
      setTimeout(function () { window.location.href = safeRedirectTarget(); }, 1200);
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const msgEl = document.getElementById('login-msg');
      const formData = Object.fromEntries(new FormData(loginForm));

      setBusy(loginForm, true);

      try {
        if (role === 'student') {
          await loginExistingStudent(formData, msgEl);
        } else if (role === 'admin') {
          await loginAdmin(formData, msgEl);
        } else if (role === 'teacher') {
          await loginFaculty(formData, msgEl);
        } else if (role === 'visitor') {
          await saveVisitor(formData, msgEl);
        }
      } finally {
        setBusy(loginForm, false);
      }
    });
  }

  async function loginExistingStudent(formData, msgEl) {
    if (!formData.identifier || !formData.password) {
      showMsg(msgEl, 'Please fill all fields.', 'error');
      return;
    }

    showMsg(msgEl, 'Checking student details...', 'success');

    const { data, error } = await db.maybeSingle(db.tables.existingStudent, {
      'enrollment number': formData.identifier,
      password: formData.password
    });

    if (error) {
      showMsg(msgEl, cleanSupabaseError(error), 'error');
      return;
    }

    if (!data) {
      showMsg(msgEl, 'Invalid enrollment number or password.', 'error');
      return;
    }

    Session.set('user', {
      role: 'student',
      identifier: data['enrollment number']
    });
    redirectAfterLogin(msgEl);
  }

  async function loginAdmin(formData, msgEl) {
    if (!formData.identifier || !formData.password) {
      showMsg(msgEl, 'Please fill all fields.', 'error');
      return;
    }

    showMsg(msgEl, 'Checking admin details...', 'success');

    const { data, error } = await db.maybeSingle(db.tables.admin, {
      username: formData.identifier,
      password: formData.password
    });

    if (error) {
      showMsg(msgEl, cleanSupabaseError(error), 'error');
      return;
    }

    if (!data) {
      showMsg(msgEl, 'Invalid admin username or password.', 'error');
      return;
    }

    Session.set('user', {
      role: 'admin',
      identifier: data.username
    });
    redirectAfterLogin(msgEl);
  }

  async function loginFaculty(formData, msgEl) {
    if (!formData.identifier || !formData.password) {
      showMsg(msgEl, 'Please fill all fields.', 'error');
      return;
    }

    showMsg(msgEl, 'Checking teacher details...', 'success');

    const { data, error } = await db.maybeSingle(db.tables.faculty, {
      email: formData.identifier,
      password: formData.password
    });

    if (error) {
      showMsg(msgEl, cleanTeacherLoginError(error), 'error');
      return;
    }

    if (!data) {
      showMsg(msgEl, 'Invalid teacher email or password.', 'error');
      return;
    }

    Session.set('user', {
      role: 'teacher',
      identifier: data.name || data.email,
      email: data.email,
      department: data.department || ''
    });
    redirectAfterLogin(msgEl);
  }

  async function saveVisitor(formData, msgEl) {
    if (!formData.name || !formData.email || !formData.contact) {
      showMsg(msgEl, 'Please fill all fields.', 'error');
      return;
    }

    showMsg(msgEl, 'Saving visitor details...', 'success');

    const { error } = await db.insert(db.tables.visitors, {
      name: formData.name,
      email: formData.email,
      contact: formData.contact
    });

    if (error) {
      showMsg(msgEl, cleanSupabaseError(error), 'error');
      return;
    }

    Session.set('user', {
      role: 'visitor',
      identifier: formData.name,
      email: formData.email,
      contact: formData.contact
    });
    redirectAfterLogin(msgEl);
  }

  function redirectAfterLogin(msgEl) {
    showMsg(msgEl, 'Login successful! Redirecting...', 'success');
    setTimeout(function () { window.location.href = safeRedirectTarget(); }, 1200);
  }

  function safeRedirectTarget() {
    const allowedPages = [
      'dashboard.html',
      'virtual-tour.html',
      'departments.html',
      'campus-map.html',
      'events.html',
      'guava-ai.html'
    ];
    const nextPage = new URLSearchParams(window.location.search).get('next');

    if (allowedPages.includes(nextPage)) {
      return nextPage;
    }

    return 'dashboard.html';
  }

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = busy;
  }

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + type;
    el.classList.remove('hidden');
  }

  function cleanSupabaseError(error) {
    if (error && error.message) return error.message;
    return 'Something went wrong while connecting to Supabase.';
  }

  function cleanTeacherLoginError(error) {
    const message = error && error.message ? error.message : '';
    const details = error && error.details ? error.details : '';
    const combined = (message + ' ' + details).toLowerCase();

    if (combined.includes('password') && combined.includes('does not exist')) {
      return 'Your faculty table has no password column. Add password column in Supabase first.';
    }

    return cleanSupabaseError(error);
  }

  function setupPasswordToggles() {
    document.querySelectorAll('input[type="password"]').forEach(function (input) {
      const wrapper = document.createElement('div');
      const toggle = document.createElement('button');

      wrapper.className = 'password-field';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      toggle.type = 'button';
      toggle.className = 'password-toggle';
      toggle.setAttribute('aria-label', 'Show password');
      toggle.textContent = '👁';

      toggle.addEventListener('click', function () {
        const shouldShow = input.type === 'password';
        input.type = shouldShow ? 'text' : 'password';
        toggle.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
        toggle.classList.toggle('visible', shouldShow);
      });

      wrapper.appendChild(toggle);
    });
  }
});

// departments.js

const PROGRAMS = {
  BE: {
    fullName: 'Bachelor of Engineering',
    branches: [
      'Automobile Engineering',
      'Civil Engineering',
      'Computer Science & Engineering',
      'Electronics & Communication Engg.',
      'Electrical Engineering',
      'Information Technology',
      'Mechanical Engineering',
      'Applied Science & Humanities'
    ]
  },
  DE: {
    fullName: 'Diploma in Engineering',
    branches: [
      'Automobile Engineering',
      'Civil Engineering',
      'Electrical Engineering',
      'Mechanical Engineering'
    ]
  },
  BVoc: {
    fullName: 'Bachelor of Vocation',
    branches: ['Software Development']
  },
  DVoc: {
    fullName: 'Diploma of Vocation',
    branches: ['Software Development']
  }
};

const BRANCH_SHORTS = {
  'Automobile Engineering': 'AE',
  'Civil Engineering': 'CE',
  'Computer Science & Engineering': 'CSE',
  'Electronics & Communication Engg.': 'ECE',
  'Electrical Engineering': 'EE',
  'Information Technology': 'IT',
  'Mechanical Engineering': 'ME',
  'Applied Science & Humanities': 'General Dept.',
  'Software Development': 'SD'
};

const PROGRAM_COURSE_TYPES = {
  BE: ['Degree'],
  DE: ['Diploma'],
  BVoc: ['BVoc'],
  DVoc: ['DVoc']
};

const BRANCH_ALIASES = {
  'Computer Science & Engineering': ['Computer Science & Engineering', 'CSE'],
  'Software Development': ['Software Development']
};

const DETAIL_SECTIONS = [
  { id: 'labs', label: 'Labs' },
  { id: 'faculty', label: 'Faculties' },
  { id: 'placements', label: 'Placements' },
  { id: 'projects', label: 'Projects' },
  { id: 'research', label: 'Research' }
];

document.addEventListener('DOMContentLoaded', function () {
  const viewPrograms = document.getElementById('view-programs');
  const viewBranches = document.getElementById('view-branches');
  const viewDetail = document.getElementById('view-detail');
  const branchGrid = document.getElementById('branch-grid');
  const detailActions = document.getElementById('detail-actions');
  const detailPanel = document.getElementById('detail-panel');

  let currentProgram = null;
  let currentBranch = null;
  let activeSection = 'faculty';
  let facultyRows = [];
  let facultyLoadStarted = false;

  document.querySelectorAll('.program-card').forEach(function (card) {
    card.addEventListener('click', function () {
      currentProgram = card.dataset.program;
      const prog = PROGRAMS[currentProgram];

      document.getElementById('branch-heading').textContent = currentProgram;
      document.getElementById('branch-subheading').textContent = prog.fullName;

      branchGrid.innerHTML = '';
      prog.branches.forEach(function (branch) {
        const btn = document.createElement('button');
        btn.className = 'branch-card';
        btn.type = 'button';
        btn.dataset.branch = branch;
        btn.innerHTML =
          '<span class="branch-short">' + (BRANCH_SHORTS[branch] || branch) + '</span>' +
          '<span class="branch-full">' + branch + '</span>';
        btn.addEventListener('click', function () { showDetail(branch); });
        branchGrid.appendChild(btn);
      });

      viewPrograms.classList.add('hidden');
      viewBranches.classList.remove('hidden');
    });
  });

  async function showDetail(branch) {
    currentBranch = branch;
    activeSection = 'faculty';

    document.getElementById('detail-title').textContent = branch;
    document.getElementById('detail-desc').textContent =
      'This department at Laxmi Institute of Technology, Sarigam offers education in ' + branch +
      ' with department resources, faculty guidance, projects, and placement support.';

    renderActionButtons();

    viewBranches.classList.add('hidden');
    viewDetail.classList.remove('hidden');

    await showSection(activeSection);
  }

  function renderActionButtons() {
    detailActions.innerHTML = DETAIL_SECTIONS.map(function (section) {
      return '<button type="button" class="detail-action-btn' +
        (section.id === activeSection ? ' active' : '') +
        '" data-section="' + section.id + '">' +
        section.label +
        '</button>';
    }).join('');

    detailActions.querySelectorAll('.detail-action-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showSection(btn.dataset.section);
      });
    });
  }

  async function showSection(sectionId) {
    activeSection = sectionId;
    detailActions.querySelectorAll('.detail-action-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    if (sectionId === 'faculty') {
      await renderFaculty();
      return;
    }

    renderStaticSection(sectionId);
  }

  function renderStaticSection(sectionId) {
    const branch = currentBranch || 'this department';
    const content = {
      labs: {
        title: 'Labs',
        body: 'Lab details for ' + branch + ' can be added here.',
        items: ['Computer / practical labs', 'Project work area', 'Department equipment']
      },
      placements: {
        title: 'Placements',
        body: 'Placement information for ' + branch + ' can be added here.',
        items: ['Training sessions', 'Company drives', 'Career guidance']
      },
      projects: {
        title: 'Projects',
        body: 'Student and faculty project details for ' + branch + ' can be added here.',
        items: ['Mini projects', 'Final year projects', 'Industry based work']
      },
      research: {
        title: 'Research',
        body: 'Research and innovation details for ' + branch + ' can be added here.',
        items: ['Publications', 'Innovation activities', 'Department initiatives']
      }
    };

    const section = content[sectionId];
    if (!section) {
      detailPanel.innerHTML = '<div class="detail-empty">No details available yet.</div>';
      return;
    }

    detailPanel.innerHTML = [
      '<section class="detail-info-panel">',
      '<h3>' + escapeHtml(section.title) + '</h3>',
      '<p>' + escapeHtml(section.body) + '</p>',
      '<div class="detail-info-grid">',
      section.items.map(function (item) {
        return '<div class="detail-info-item">' + escapeHtml(item) + '</div>';
      }).join(''),
      '</div>',
      '</section>'
    ].join('');
  }

  async function renderFaculty() {
    detailPanel.innerHTML = '<div class="detail-empty">Loading faculty details...</div>';

    try {
      await loadFacultyRows();
    } catch (error) {
      console.error(error);
      detailPanel.innerHTML = '<div class="detail-empty">Faculty data could not be loaded: ' + escapeHtml(error.message) + '</div>';
      return;
    }

    if (!facultyRows.length) {
      detailPanel.innerHTML = '<div class="detail-empty">No faculty records found in Supabase. Import faculty rows into faculty_details first.</div>';
      return;
    }

    const rows = filterFaculty(currentBranch);
    if (!rows.length) {
      detailPanel.innerHTML = '<div class="detail-empty">No faculty details found for ' + escapeHtml(currentBranch) + ' in ' + escapeHtml(currentProgram) + ' yet.</div>';
      return;
    }

    detailPanel.innerHTML = [
      '<section class="faculty-section">',
      '<h3 class="faculty-heading">Faculty Details</h3>',
      '<div class="faculty-list">',
      rows.map(facultyCard).join(''),
      '</div>',
      '</section>'
    ].join('');
  }

  async function loadFacultyRows() {
    if (facultyLoadStarted) return;
    facultyLoadStarted = true;

    const db = window.CamosphereSupabase;
    if (!db || !db.tables || !db.tables.departmentFaculty) {
      throw new Error('Supabase config missing departmentFaculty table.');
    }

    const detailedResult = await db.select(db.tables.departmentFaculty, {
      columns: '*'
    });

    let data = detailedResult.data;
    let error = detailedResult.error;

    if (error && error.status === 404 && db.tables.faculty) {
      const fallbackResult = await db.select(db.tables.faculty, {
        columns: '*'
      });

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      facultyLoadStarted = false;
      throw new Error(formatSupabaseError(error));
    }

    facultyRows = Array.isArray(data)
      ? data.map(normalizeFacultyRow).filter(function (row) {
          return row.name || row.email || row.department;
        }).sort(function (a, b) {
          return (a.name || '').localeCompare(b.name || '');
        })
      : [];
  }

  function normalizeFacultyRow(row) {
    return {
      name: valueFrom(row, ['name', 'Name', 'faculty_name', 'Faculty Name']),
      email: valueFrom(row, ['email', 'Email', 'Email Address', 'email_address']),
      department: normalizeDepartment(valueFrom(row, ['department', 'Department'])),
      course_type: normalizeCourseType(valueFrom(row, ['course_type', 'Course Type', 'course type'])),
      designation: valueFrom(row, ['designation', 'Designation', 'Please specify your designation in the department.']) || 'Faculty',
      location: valueFrom(row, ['location', 'Location', 'Usual on-campus location for availability:']),
      monday: dayValue(row, 'Monday'),
      tuesday: dayValue(row, 'Tuesday'),
      wednesday: dayValue(row, 'Wednesday'),
      thursday: dayValue(row, 'Thursday'),
      friday: dayValue(row, 'Friday'),
      sem_1: valueFrom(row, ['sem_1', 'Sem 1', 'Semester 1']),
      sem_2: valueFrom(row, ['sem_2', 'Sem 2', 'Semester 2']),
      sem_3: valueFrom(row, ['sem_3', 'Sem 3', 'Semester 3']),
      sem_4: valueFrom(row, ['sem_4', 'Sem 4', 'Semester 4']),
      sem_5: valueFrom(row, ['sem_5', 'Sem 5', 'Semester 5']),
      sem_6: valueFrom(row, ['sem_6', 'Sem 6', 'Semester 6']),
      sem_7: valueFrom(row, ['sem_7', 'Sem 7', 'Semester 7']),
      sem_8: valueFrom(row, ['sem_8', 'Sem 8', 'Semester 8'])
    };
  }

  function valueFrom(row, aliases) {
    const keys = Object.keys(row || {});

    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== null) {
        return String(row[alias]).trim();
      }
    }

    const normalizedAliases = aliases.map(normalizeKey);
    const matchedKey = keys.find(function (key) {
      return normalizedAliases.includes(normalizeKey(key));
    });

    if (!matchedKey || row[matchedKey] === null || row[matchedKey] === undefined) {
      return '';
    }

    return String(row[matchedKey]).trim();
  }

  function dayValue(row, day) {
    const directValue = valueFrom(row, [day.toLowerCase(), day]);
    if (directValue) return directValue;

    const dayKey = Object.keys(row || {}).find(function (key) {
      return key.toLowerCase().includes('[' + day.toLowerCase() + ']');
    });

    if (!dayKey || row[dayKey] === null || row[dayKey] === undefined) {
      return '';
    }

    return String(row[dayKey]).trim();
  }

  function normalizeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function normalizeDepartment(value) {
    const text = String(value || '').trim();
    if (text.toUpperCase() === 'CSE') return 'Computer Science & Engineering';
    return text;
  }

  function normalizeCourseType(value) {
    const text = String(value || '').trim();
    if (text.toLowerCase() === 'degree') return 'Degree';
    if (text.toLowerCase() === 'diploma') return 'Diploma';
    if (text.toLowerCase() === 'bvoc') return 'BVoc';
    if (text.toLowerCase() === 'dvoc') return 'DVoc';
    return text;
  }

  function filterFaculty(branch) {
    const aliases = BRANCH_ALIASES[branch] || [branch];
    const courseTypes = PROGRAM_COURSE_TYPES[currentProgram] || [];

    const exactMatches = facultyRows.filter(function (row) {
      const departmentMatch = aliases.includes(row.department);
      const courseMatch = !courseTypes.length || courseTypes.includes(row.course_type);
      return departmentMatch && courseMatch;
    });

    if (exactMatches.length) {
      return exactMatches;
    }

    return facultyRows.filter(function (row) {
      return aliases.includes(row.department);
    });
  }

  function facultyCard(row) {
    const subjects = [
      ['Sem 1', row.sem_1],
      ['Sem 2', row.sem_2],
      ['Sem 3', row.sem_3],
      ['Sem 4', row.sem_4],
      ['Sem 5', row.sem_5],
      ['Sem 6', row.sem_6],
      ['Sem 7', row.sem_7],
      ['Sem 8', row.sem_8]
    ].filter(function (item) { return isUsefulValue(item[1]); });

    const availability = [
      ['Monday', row.monday],
      ['Tuesday', row.tuesday],
      ['Wednesday', row.wednesday],
      ['Thursday', row.thursday],
      ['Friday', row.friday]
    ].filter(function (item) { return isUsefulValue(item[1]); });

    return [
      '<article class="faculty-card">',
      '<div class="faculty-card-head">',
      '<div>',
      '<h4 class="faculty-name">' + escapeHtml(row.name || 'Faculty') + '</h4>',
      '<p class="faculty-designation">' + escapeHtml(row.designation || 'Faculty') + '</p>',
      '</div>',
      '<span class="faculty-course">' + escapeHtml(row.course_type || 'Course') + '</span>',
      '</div>',
      '<div class="faculty-meta-chips">',
      row.location ? '<span>Location: ' + escapeHtml(row.location) + '</span>' : '',
      row.email ? '<span>' + escapeHtml(row.email) + '</span>' : '',
      '</div>',
      subjects.length ? '<div class="faculty-block"><strong>Subjects Taken</strong><div class="faculty-subject-grid">' + subjects.map(function (item) {
        return '<span class="subject-pill"><b>' + item[0] + '</b>' + escapeHtml(item[1]) + '</span>';
      }).join('') + '</div></div>' : '',
      availability.length ? '<div class="faculty-block"><strong>Free Lecture Timings</strong><div class="faculty-slots">' + availability.map(function (item) {
        return '<span><b>' + item[0] + '</b><em>' + escapeHtml(item[1]) + '</em></span>';
      }).join('') + '</div></div>' : '',
      '</article>'
    ].join('');
  }

  function isUsefulValue(value) {
    if (!value) return false;
    const text = String(value).trim();
    return text && text.toUpperCase() !== 'NA';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSupabaseError(error) {
    return [
      error.status ? 'HTTP ' + error.status : '',
      error.message,
      error.details,
      error.hint
    ].filter(Boolean).join(' - ');
  }

  document.getElementById('back-to-programs').addEventListener('click', function () {
    viewBranches.classList.add('hidden');
    viewPrograms.classList.remove('hidden');
  });

  document.getElementById('back-to-branches').addEventListener('click', function () {
    viewDetail.classList.add('hidden');
    viewBranches.classList.remove('hidden');
  });
});

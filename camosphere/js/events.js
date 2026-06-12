// events.js - Supabase event calendar with multi-day bars

let currentDate = new Date();

document.addEventListener('DOMContentLoaded', function () {

  renderCalendar();

  document.getElementById('today-btn').addEventListener('click', function () {
    currentDate = new Date();
    renderCalendar();
  });

  document.getElementById('prev-btn').addEventListener('click', function () {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById('next-btn').addEventListener('click', function () {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);

  document.getElementById('event-modal').addEventListener('click', function (e) {

    if (!e.target.closest('.modal-box')) {
      closeModal();
    }

  });

  document.addEventListener('keydown', function (e) {

    if (e.key === 'Escape') {
      closeModal();
    }

  });

});

async function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const grid = document.getElementById('cal-grid');

  document.getElementById('month-title').textContent =
    currentDate.toLocaleString('default', { month: 'long' }) + ' ' + year;

  grid.innerHTML = '<div class="cal-loading">Loading events...</div>';

  const calendarStart = startOfWeek(new Date(year, month, 1));
  const calendarEndExclusive = addDays(calendarStart, 42);

  try {
    const events = await loadEvents(calendarStart, calendarEndExclusive);
    drawCalendarGrid(grid, calendarStart, month, events);
  } catch (error) {
    console.error(error);
    grid.innerHTML = '<div class="cal-loading">Could not load events: ' + escapeHtml(error.message) + '</div>';
  }
}

async function loadEvents(calendarStart, calendarEndExclusive) {
  const db = window.CamosphereSupabase;
  if (!db || !db.tables || !db.tables.events) {
    throw new Error('Supabase config is not loaded.');
  }

  const rangeStart = formatDate(calendarStart);
  const rangeEndExclusive = formatDate(calendarEndExclusive);
  const result = await db.select(db.tables.events, { columns: '*' });

  if (result.error) {
    throw new Error(formatSupabaseError(result.error));
  }

  return (Array.isArray(result.data) ? result.data : [])
    .map(normalizeEvent)
    .filter(function (event) {
      return event.start_date && event.end_date &&
        event.start_date < rangeEndExclusive &&
        event.end_date >= rangeStart;
    })
    .sort(function (a, b) {
      return (a.start_date + a.start_time + a.title).localeCompare(b.start_date + b.start_time + b.title);
    });
}

function drawCalendarGrid(grid, calendarStart, activeMonth, events) {
  const today = formatDate(new Date());
  const cells = [];

  grid.innerHTML = '';

  for (let index = 0; index < 35; index++) {
    const date = addDays(calendarStart, index);
    const dateKey = formatDate(date);
    const dayEvents = events.filter(function (event) {
      return event.start_date <= dateKey && event.end_date >= dateKey;
    });

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = [
      'cal-cell',
      date.getMonth() === activeMonth ? 'cal-day' : 'cal-other-month',
      dateKey === today ? 'cal-today' : '',
      dayEvents.length ? 'has-events' : ''
    ].filter(Boolean).join(' ');
    cell.style.gridColumn = String((index % 7) + 1);
    cell.style.gridRow = String(Math.floor(index / 7) + 1);
    cell.innerHTML = calendarCellHtml(date, dayEvents);

    if (dayEvents.length) {
      cell.addEventListener('click', function () {
        showModal(dayEvents, dateLabel(date));
      });
    }

    cells.push(cell);
    grid.appendChild(cell);
  }

  drawEventBars(grid, calendarStart, events);
}

function drawEventBars(grid, calendarStart, events) {
  const calendarEndInclusive = addDays(calendarStart, 34);
  const weekLanes = [[], [], [], [], [], []];

  events.forEach(function (event) {
    let segmentStart = maxDate(parseDate(event.start_date), calendarStart);
    const eventEnd = minDate(parseDate(event.end_date), calendarEndInclusive);

    while (segmentStart <= eventEnd) {
      const startIndex = daysBetween(calendarStart, segmentStart);
      const week = Math.floor(startIndex / 7);
      const col = (startIndex % 7) + 1;
      const weekEndIndex = Math.min((week * 7) + 6, daysBetween(calendarStart, eventEnd));
      const span = weekEndIndex - startIndex + 1;
      const lane = reserveLane(weekLanes[week], col, col + span - 1);

      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'event-bar' + (span > 1 ? ' multi-day' : '');
      bar.style.gridColumn = col + ' / span ' + span;
      bar.style.gridRow = String(week + 1);
      bar.style.setProperty('--lane', String(lane));
      bar.title = event.title;
      bar.innerHTML = '<span>' + escapeHtml(event.title) + '</span>';
      bar.addEventListener('click', function (e) {
        e.stopPropagation();
        showModal([event]);
      });

      grid.appendChild(bar);
      segmentStart = addDays(calendarStart, weekEndIndex + 1);
    }
  });
}

function reserveLane(lanes, startCol, endCol) {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] < startCol) {
      lanes[i] = endCol;
      return i;
    }
  }

  lanes.push(endCol);
  return lanes.length - 1;
}

function calendarCellHtml(date, dayEvents) {
  return '<span class="day-num">' + date.getDate() + '</span>';
}

function showModal(events, headingDate) {
  const heading = headingDate || eventRangeText(events[0]);

  document.getElementById('modal-body').innerHTML =
    '<p class="modal-date">' + escapeHtml(heading) + '</p>' +
    events.map(eventModalHtml).join('');

  document.getElementById('event-modal').classList.remove('hidden');
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function eventModalHtml(event) {
  return [
    '<article class="modal-event-item">',
    '<div class="modal-event-head">',
    '<h3 class="modal-title">' + escapeHtml(event.title) + '</h3>',
    event.category ? '<span class="modal-category">' + escapeHtml(event.category) + '</span>' : '',
    '</div>',
    '<p class="modal-time">' + escapeHtml(eventRangeText(event)) + (eventTimeText(event) ? ' | ' + escapeHtml(eventTimeText(event)) : '') + '</p>',
    event.location ? '<p class="modal-location">Location: ' + escapeHtml(event.location) + '</p>' : '',
    event.description ? '<p class="modal-desc">' + escapeHtml(event.description) + '</p>' : '',
    '</article>'
  ].join('');
}

function normalizeEvent(row) {
  const startDate = valueFrom(row, ['start_date', 'event_date', 'date', 'Date', 'Event Date', 'Start Date']);
  const endDate = valueFrom(row, ['end_date', 'End Date']) || startDate;

  return {
    title: valueFrom(row, ['title', 'Title']) || 'Untitled Event',
    start_date: startDate,
    end_date: endDate < startDate ? startDate : endDate,
    start_time: trimTime(valueFrom(row, ['start_time', 'start time', 'Start Time'])),
    end_time: trimTime(valueFrom(row, ['end_time', 'end time', 'End Time'])),
    location: valueFrom(row, ['location', 'Location']),
    description: valueFrom(row, ['description', 'Description']),
    category: valueFrom(row, ['category', 'Category'])
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

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function startOfWeek(date) {
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -date.getDay());
}

function parseDate(value) {
  return new Date(value + 'T00:00:00');
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function maxDate(a, b) {
  return a > b ? a : b;
}

function minDate(a, b) {
  return a < b ? a : b;
}

function daysBetween(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / msPerDay);
}

function trimTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

function eventTimeText(event) {
  if (event.start_time && event.end_time) return event.start_time + ' - ' + event.end_time;
  if (event.start_time) return event.start_time;
  return '';
}

function dateLabel(date) {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function eventRangeText(event) {
  const start = parseDate(event.start_date);
  const end = parseDate(event.end_date);

  if (event.start_date === event.end_date) {
    return dateLabel(start);
  }

  return start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' - ' +
    end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function formatSupabaseError(error) {
  return [
    error.status ? 'HTTP ' + error.status : '',
    error.message,
    error.details,
    error.hint
  ].filter(Boolean).join(' - ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function closeModal() {
  document.getElementById('event-modal').classList.add('hidden');
  document.getElementById('modal-backdrop').classList.add('hidden');
}

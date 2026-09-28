// ============ Constants ============
const SUBJECT_COLORS = [
  '#7C4DFF', '#00BFA5', '#FF6D00', '#2979FF',
  '#D500F9', '#00C853', '#FF1744', '#FFAB00'
];
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTH_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const KEY_SCHEDULE = 'schedule_v1';
const KEY_SUBJECTS = 'subjects_v1';
const KEY_TESTS    = 'tests_v1';
const KEY_FILTER   = 'grade_filter_v1';
const KEY_GRADES_OLD = 'grades_v1';

const TEST_TYPES = [
  { id: 'test',     label: 'Test',     color: '#2979FF' },
  { id: 'oral',     label: 'Oral',     color: '#7C4DFF' },
  { id: 'homework', label: 'Homework', color: '#00C853' },
  { id: 'project',  label: 'Project',  color: '#D500F9' },
  { id: 'other',    label: 'Other',    color: '#5A5F6E' },
];
function testType(id) {
  return TEST_TYPES.find(t => t.id === id) || TEST_TYPES[TEST_TYPES.length - 1];
}

// ============ State ============
let schedule = loadJSON(KEY_SCHEDULE, []);
let subjects = loadJSON(KEY_SUBJECTS, []);
let tests    = loadJSON(KEY_TESTS, []);
let gradeFilter = loadJSON(KEY_FILTER, 'all');
let currentView = 'schedule';
let expandedDay = todayIndex();

// --- Migration ---
(function migrate() {
  const old = loadJSON(KEY_GRADES_OLD, null);
  if (Array.isArray(old) && old.length > 0 && subjects.length === 0) {
    subjects = old.map(g => ({
      id: g.id || uid(),
      name: g.subject || 'Subject',
      grades: [{ id: uid(), value: g.grade || 1, sem: 1 }]
    }));
    saveJSON(KEY_SUBJECTS, subjects);
    try { localStorage.removeItem(KEY_GRADES_OLD); } catch {}
  }
  let touched = false;
  subjects = subjects.map(s => {
    const grades = (s.grades || []).map(g => {
      if (typeof g.sem !== 'number') { touched = true; return { ...g, sem: 1 }; }
      return g;
    });
    return { ...s, grades };
  });
  if (touched) saveJSON(KEY_SUBJECTS, subjects);
})();

// ============ Helpers ============
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}
function todayIndex() { return (new Date().getDay() + 6) % 7; }
function haptic(ms = 10) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
}
function tapPulse(el) {
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 220);
}

// --- Date helpers ---
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseISODateLocal(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function daysUntil(iso) {
  const today = parseISODateLocal(todayISO());
  const target = parseISODateLocal(iso);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}
function countdownText(iso) {
  const n = daysUntil(iso);
  if (n === 0) return { text: 'Today', cls: 'today' };
  if (n === 1) return { text: 'Tomorrow', cls: 'soon' };
  if (n > 1 && n <= 7) return { text: `in ${n} days`, cls: 'soon' };
  if (n > 7) return { text: `in ${n} days`, cls: 'ok' };
  if (n === -1) return { text: 'Yesterday', cls: 'done' };
  return { text: `${-n} days ago`, cls: 'done' };
}
function allSubjectNames() {
  const set = new Set();
  schedule.forEach(c => c.subject && set.add(c.subject));
  subjects.forEach(s => s.name && set.add(s.name));
  tests.forEach(t => t.subject && set.add(t.subject));
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ============ Grades math ============
function gradesFor(s, filter) {
  if (filter === 'all') return s.grades;
  return s.grades.filter(g => g.sem === filter);
}
function subjectAverage(s, filter = gradeFilter) {
  const list = gradesFor(s, filter);
  if (!list.length) return 0;
  return list.reduce((sum, g) => sum + g.value, 0) / list.length;
}
function subjectGradeCount(s, filter = gradeFilter) {
  return gradesFor(s, filter).length;
}
function computeGpa(filter = gradeFilter) {
  const graded = subjects.filter(s => subjectGradeCount(s, filter) > 0);
  if (!graded.length) return 0;
  return graded.reduce((sum, s) => sum + subjectAverage(s, filter), 0) / graded.length;
}
function gradeColorFor(avg) {
  if (avg >= 4.5) return '#00C853';
  if (avg >= 3.5) return '#2979FF';
  if (avg >= 2.5) return '#FFAB00';
  if (avg >= 1.5) return '#FF6D00';
  if (avg > 0)    return '#FF1744';
  return '#5A5F6E';
}
function filterLabel(f) {
  if (f === 1) return '1st semester';
  if (f === 2) return '2nd semester';
  return 'both semesters';
}

// ============ Rendering ============
function render() {
  renderTopbar();
  if (currentView === 'schedule') renderSchedule();
  else if (currentView === 'tests') renderTests();
  else renderGrades();
}

function renderTopbar() {
  const title = document.getElementById('pageTitle');
  const actions = document.getElementById('topbarActions');
  if (currentView === 'schedule') {
    title.textContent = 'My Schedule';
    actions.innerHTML = `
      <button class="icon-btn" data-action="import" aria-label="Import">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      <button class="icon-btn" data-action="export" aria-label="Share">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
      </button>
    `;
  } else if (currentView === 'tests') {
    title.textContent = 'Tests & Orals';
    actions.innerHTML = '';
  } else {
    title.textContent = 'My Grades';
    actions.innerHTML = '';
  }
}

// --- Schedule ---
function classRowHtml(c) {
  const color = SUBJECT_COLORS[c.colorIndex % SUBJECT_COLORS.length];
  return `
    <div class="class-row" data-id="${c.id}">
      <span class="class-bar" style="background:${color}"></span>
      <div class="class-times">
        <div class="class-start">${escapeHtml(c.start)}</div>
        <div class="class-end">${escapeHtml(c.end)}</div>
      </div>
      <div class="class-info">
        <div class="class-subject">${escapeHtml(c.subject)}</div>
        ${c.room ? `<div class="class-room">${escapeHtml(c.room)}</div>` : ''}
      </div>
      <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  `;
}

function renderSchedule() {
  const view = document.getElementById('scheduleView');
  const t = todayIndex();
  const todayClasses = schedule
    .filter(c => c.day === t)
    .sort((a, b) => a.start.localeCompare(b.start));

  let html = `
    <div class="today-card">
      <div class="today-label">Today · ${DAY_NAMES[t]}</div>
      ${
        todayClasses.length === 0
          ? '<div class="today-empty">No classes today 🎉</div>'
          : todayClasses.map(c => `
              <div class="today-row">
                <span class="today-time">${escapeHtml(c.start)}</span>
                <span class="today-subject">${escapeHtml(c.subject)}</span>
                ${c.room ? `<span class="today-room">${escapeHtml(c.room)}</span>` : ''}
              </div>
            `).join('')
      }
    </div>
  `;

  for (let d = 0; d < 7; d++) {
    const classes = schedule
      .filter(c => c.day === d)
      .sort((a, b) => a.start.localeCompare(b.start));
    const isToday = d === t;
    if (!(d < 5 || classes.length > 0)) continue;

    const isOpen = expandedDay === d;

    html += `
      <div class="day-card ${isToday ? 'is-today' : ''} ${isOpen ? 'expanded' : ''}">
        <div class="day-header" data-toggle-day="${d}">
          <span class="day-name">${DAY_NAMES[d]}</span>
          ${isToday ? '<span class="badge">Today</span>' : ''}
          <span class="day-count">${classes.length} ${classes.length === 1 ? 'class' : 'classes'}</span>
          <svg class="day-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="day-body">
          <div class="day-body-inner">
            ${classes.length === 0
              ? '<div class="empty">No classes</div>'
              : classes.map(classRowHtml).join('')}
          </div>
        </div>
      </div>
    `;
  }

  view.innerHTML = html;
}

// --- Tests ---
function testRowHtml(t, isPast) {
  const type = testType(t.type);
  const date = parseISODateLocal(t.date);
  const cd = countdownText(t.date);

  return `
    <div class="test-row ${isPast ? 'past' : ''}" data-id="${t.id}">
      <div class="test-date" style="background:${type.color}">
        <div class="test-day">${date.getDate()}</div>
        <div class="test-month">${MONTH_SHORT[date.getMonth()]}</div>
      </div>
      <div class="test-body">
        <div class="test-subject">${escapeHtml(t.subject)}</div>
        <div class="test-meta">
          ${t.time ? escapeHtml(t.time) : 'all day'}${t.note ? ' · ' + escapeHtml(t.note) : ''}
        </div>
        <div class="test-countdown ${cd.cls}">${cd.text}</div>
      </div>
      <div class="test-type" style="background:${type.color}22;color:${type.color}">${type.label}</div>
    </div>
  `;
}

function renderTests() {
  const view = document.getElementById('testsView');

  const sorted = [...tests].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || '').localeCompare(b.time || '');
  });

  const upcoming = sorted.filter(t => daysUntil(t.date) >= 0);
  const past = sorted.filter(t => daysUntil(t.date) < 0).reverse();

  if (tests.length === 0) {
    view.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">No tests or orals yet</div>
        <div class="empty-sub">Tap the + button to add your first one</div>
      </div>
    `;
    return;
  }

  let html = '';
  if (upcoming.length > 0) {
    html += `<div class="section-title">Upcoming · ${upcoming.length}</div>`;
    html += upcoming.map(t => testRowHtml(t, false)).join('');
  } else {
    html += `<div class="section-title">Upcoming</div>
      <div class="empty-state" style="padding:24px">
        <div class="empty-title" style="font-size:14px">Nothing coming up 🎉</div>
      </div>`;
  }

  if (past.length > 0) {
    html += `<div class="section-title" style="margin-top:24px">Past</div>`;
    html += past.slice(0, 20).map(t => testRowHtml(t, true)).join('');
  }

  view.innerHTML = html;
}

// --- Grades list ---
function subjectRowHtml(s) {
  const count = subjectGradeCount(s, gradeFilter);
  const avg = subjectAverage(s, gradeFilter);
  const color = gradeColorFor(avg);

  return `
    <div class="grade-row" data-id="${s.id}">
      <div class="grade-subject">
        <div>${escapeHtml(s.name)}</div>
        <div style="font-size:12px;color:var(--text-muted);font-weight:500;margin-top:2px">
          ${gradeFilter === 'all'
            ? `Sem1: ${s.grades.filter(g=>g.sem===1).length} · Sem2: ${s.grades.filter(g=>g.sem===2).length}`
            : `${count} ${count === 1 ? 'grade' : 'grades'} · ${filterLabel(gradeFilter)}`}
        </div>
      </div>
      <div class="grade-pill" style="background:${color}22;color:${color}">
        ${count === 0 ? '—' : avg.toFixed(2)}
      </div>
      <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  `;
}

function renderGrades() {
  const view = document.getElementById('gradesView');
  const gpa = computeGpa(gradeFilter);
  const color = gradeColorFor(gpa);
  const totalGrades = subjects.reduce((sum, s) => sum + subjectGradeCount(s, gradeFilter), 0);
  const withGrades = subjects.filter(s => subjectGradeCount(s, gradeFilter) > 0);

  const segs = [
    { key: 1, label: '1st sem' },
    { key: 2, label: '2nd sem' },
    { key: 'all', label: 'Both' },
  ];

  let html = `
    <div class="segmented" id="gradeFilter">
      ${segs.map(s => `
        <button class="seg ${gradeFilter === s.key ? 'active' : ''}" data-sem="${s.key}">${s.label}</button>
      `).join('')}
    </div>

    <div class="gpa-card" style="--gpa-color:${color}">
      <div class="gpa-label">GPA · ${filterLabel(gradeFilter).replace(/^./, c => c.toUpperCase())}</div>
      <div class="gpa-value">${withGrades.length === 0 ? '—' : gpa.toFixed(2)}</div>
      <div class="gpa-count">
        ${subjects.length} subject${subjects.length === 1 ? '' : 's'} · ${totalGrades} grade${totalGrades === 1 ? '' : 's'}
      </div>
    </div>
  `;

  if (subjects.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-icon">🎓</div>
        <div class="empty-title">No subjects added yet</div>
        <div class="empty-sub">Tap the + button to add your first subject</div>
      </div>
    `;
  } else {
    html += subjects.map(subjectRowHtml).join('');
  }

  view.innerHTML = html;
}

// ============ Sheet plumbing ============
function openSheet(html, onMount) {
  const sheet = document.getElementById('sheet');
  const overlay = document.getElementById('sheetOverlay');
  sheet.innerHTML = html;
  if (!sheet.classList.contains('open')) {
    void sheet.offsetHeight;
    sheet.classList.add('open');
    overlay.classList.add('open');
  }
  if (onMount) onMount(sheet);
}
function closeSheet() {
  const sheet = document.getElementById('sheet');
  const overlay = document.getElementById('sheetOverlay');
  sheet.classList.remove('open');
  overlay.classList.remove('open');
  setTimeout(() => { sheet.innerHTML = ''; }, 320);
}

// ============ Class sheet ============
function openClassSheet(existing) {
  const isEdit = !!existing;
  const c = existing || {
    day: todayIndex(), start: '08:00', end: '09:00',
    subject: '', room: '', colorIndex: 0
  };

  const html = `
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">${isEdit ? 'Edit class' : 'Add class'}</h2>
    <form id="classForm" autocomplete="off">
      <label class="field">
        <span>Day</span>
        <select name="day">
          ${DAY_NAMES.map((n, i) => `
            <option value="${i}" ${i === c.day ? 'selected' : ''}>${n}</option>
          `).join('')}
        </select>
      </label>
      <div class="field-row">
        <label class="field">
          <span>Start</span>
          <input type="time" name="start" value="${c.start}" required>
        </label>
        <label class="field">
          <span>End</span>
          <input type="time" name="end" value="${c.end}" required>
        </label>
      </div>
      <label class="field">
        <span>Subject</span>
        <input type="text" name="subject" value="${escapeHtml(c.subject)}" placeholder="e.g. Mathematics" required>
      </label>
      <label class="field">
        <span>Room</span>
        <input type="text" name="room" value="${escapeHtml(c.room)}" placeholder="e.g. A1">
      </label>
      <div class="field">
        <span>Color</span>
        <div class="color-picker" id="colorPicker">
          ${SUBJECT_COLORS.map((col, i) => `
            <button type="button" class="color-dot ${i === c.colorIndex ? 'selected' : ''}"
                    data-color="${i}" style="background:${col}"></button>
          `).join('')}
        </div>
      </div>
      <div class="sheet-actions">
        ${isEdit ? '<button type="button" class="btn btn-danger" id="deleteBtn">Delete</button>' : ''}
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    </form>
  `;

  openSheet(html, (sheet) => {
    let colorIndex = c.colorIndex;
    const picker = sheet.querySelector('#colorPicker');
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.color-dot');
      if (!btn) return;
      haptic(6);
      colorIndex = parseInt(btn.dataset.color, 10);
      picker.querySelectorAll('.color-dot').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });

    sheet.querySelector('#cancelBtn').addEventListener('click', () => { haptic(6); closeSheet(); });

    if (isEdit) {
      sheet.querySelector('#deleteBtn').addEventListener('click', () => {
        haptic(15);
        if (!confirm('Delete this class?')) return;
        schedule = schedule.filter(x => x.id !== existing.id);
        saveJSON(KEY_SCHEDULE, schedule);
        closeSheet();
        render();
      });
    }

    sheet.querySelector('#classForm').addEventListener('submit', (e) => {
      e.preventDefault();
      haptic(12);
      const fd = new FormData(e.target);
      const subject = String(fd.get('subject') || '').trim();
      if (!subject) return;

      const item = {
        id: existing ? existing.id : uid(),
        day: parseInt(fd.get('day'), 10),
        start: String(fd.get('start') || '08:00'),
        end: String(fd.get('end') || '09:00'),
        subject,
        room: String(fd.get('room') || '').trim(),
        colorIndex
      };

      if (isEdit) schedule = schedule.map(x => x.id === item.id ? item : x);
      else schedule.push(item);

      saveJSON(KEY_SCHEDULE, schedule);
      closeSheet();
      render();
    });
  });
}

// ============ Test sheet ============
function openTestSheet(existing) {
  const isEdit = !!existing;
  const t = existing || {
    subject: '',
    date: todayISO(),
    time: '',
    type: 'test',
    note: ''
  };
  let selectedType = t.type;

  const suggestions = allSubjectNames();
  const datalist = `
    <datalist id="subjectSuggestions">
      ${suggestions.map(n => `<option value="${escapeHtml(n)}"></option>`).join('')}
    </datalist>
  `;

  const html = `
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">${isEdit ? 'Edit' : 'Add test or oral'}</h2>
    <form id="testForm" autocomplete="off">
      <label class="field">
        <span>Subject</span>
        <input type="text" name="subject" list="subjectSuggestions"
               value="${escapeHtml(t.subject)}" placeholder="e.g. Mathematics" required>
      </label>
      ${datalist}

      <div class="field">
        <span>Type</span>
        <div class="type-picker" id="typePicker">
          ${TEST_TYPES.map(ty => `
            <button type="button"
                    class="type-chip ${ty.id === selectedType ? 'selected' : ''}"
                    data-type="${ty.id}"
                    style="${ty.id === selectedType ? `background:${ty.color}22;border-color:${ty.color};color:${ty.color}` : ''}">
              ${ty.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="field-row">
        <label class="field">
          <span>Date</span>
          <input type="date" name="date" value="${t.date}" required>
        </label>
        <label class="field">
          <span>Time (optional)</span>
          <input type="time" name="time" value="${t.time}">
        </label>
      </div>

      <label class="field">
        <span>Note (optional)</span>
        <input type="text" name="note" value="${escapeHtml(t.note)}" placeholder="e.g. Chapter 3–5, bring calculator">
      </label>

      <div class="sheet-actions">
        ${isEdit ? '<button type="button" class="btn btn-danger" id="deleteBtn">Delete</button>' : ''}
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    </form>
  `;

  openSheet(html, (sheet) => {
    const picker = sheet.querySelector('#typePicker');
    picker.addEventListener('click', (e) => {
      const chip = e.target.closest('.type-chip');
      if (!chip) return;
      haptic(6);
      selectedType = chip.dataset.type;
      picker.querySelectorAll('.type-chip').forEach(c => {
        const ty = testType(c.dataset.type);
        const on = c.dataset.type === selectedType;
        c.classList.toggle('selected', on);
        c.style.background = on ? `${ty.color}22` : '';
        c.style.borderColor = on ? ty.color : '';
        c.style.color = on ? ty.color : '';
      });
    });

    sheet.querySelector('#cancelBtn').addEventListener('click', () => { haptic(6); closeSheet(); });

    if (isEdit) {
      sheet.querySelector('#deleteBtn').addEventListener('click', () => {
        haptic(15);
        if (!confirm('Delete this item?')) return;
        tests = tests.filter(x => x.id !== existing.id);
        saveJSON(KEY_TESTS, tests);
        closeSheet();
        render();
      });
    }

    sheet.querySelector('#testForm').addEventListener('submit', (e) => {
      e.preventDefault();
      haptic(12);
      const fd = new FormData(e.target);
      const subject = String(fd.get('subject') || '').trim();
      const date = String(fd.get('date') || '').trim();
      if (!subject || !date) return;

      const item = {
        id: existing ? existing.id : uid(),
        subject,
        date,
        time: String(fd.get('time') || '').trim(),
        type: selectedType,
        note: String(fd.get('note') || '').trim()
      };

      if (isEdit) tests = tests.map(x => x.id === item.id ? item : x);
      else tests.push(item);

      saveJSON(KEY_TESTS, tests);
      closeSheet();
      render();
    });
  });
}

// ============ Subject sheet ============
function openSubjectSheet(existing) {
  const isNew = !existing;
  const s = existing || { id: uid(), name: '', grades: [] };
  let firstGrade = null;
  let firstGradeSem = 1;

  function newHtml() {
    return `
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">Add subject</h2>
      <form id="subjectForm" autocomplete="off">
        <label class="field">
          <span>Subject name</span>
          <input type="text" name="name" placeholder="e.g. Mathematics" required>
        </label>

        <div class="field">
          <span>First grade (optional)</span>
          <div class="segmented small" id="firstGradeSem">
            <button type="button" class="seg ${firstGradeSem === 1 ? 'active' : ''}" data-sem="1">1st sem</button>
            <button type="button" class="seg ${firstGradeSem === 2 ? 'active' : ''}" data-sem="2">2nd sem</button>
          </div>
        </div>

        <div class="field">
          <div class="calc-buttons" id="firstGradeRow" style="margin-left:0;justify-content:space-between">
            ${[1,2,3,4,5].map(n => `
              <button type="button" class="calc-btn ${firstGrade === n ? 'selected' : ''}"
                      data-grade="${n}" style="flex:1;height:48px;font-size:20px">${n}</button>
            `).join('')}
          </div>
        </div>

        <div class="sheet-actions">
          <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary">Add</button>
        </div>
      </form>
    `;
  }

  function semBlock(sem) {
    const list = s.grades.filter(g => g.sem === sem);
    const avg = list.length ? list.reduce((a,b)=>a+b.value,0)/list.length : 0;
    const avgColor = list.length ? gradeColorFor(avg) : '#5A5F6E';
    return `
      <div class="sem-block">
        <div class="sem-header">
          <span class="sem-label">${sem === 1 ? '1st semester' : '2nd semester'}</span>
          <span class="sem-avg" style="color:${avgColor};background:${avgColor}22">
            ${list.length ? avg.toFixed(2) : '—'}
          </span>
        </div>
        ${list.length ? `
          <div class="grades-list">
            ${list.map(g => `
              <button type="button" class="grade-chip"
                      data-grade-id="${g.id}"
                      style="background:${gradeColorFor(g.value)}22;color:${gradeColorFor(g.value)}">
                ${g.value}
                <span class="chip-x">×</span>
              </button>
            `).join('')}
          </div>
        ` : `<div class="sem-empty">No grades yet — tap a number below</div>`}
        <div class="calc-buttons add-row" data-add-sem="${sem}" style="margin-left:0;justify-content:space-between">
          ${[1,2,3,4,5].map(n => `
            <button type="button" class="calc-btn" data-add-grade="${n}"
                    style="flex:1;height:48px;font-size:18px">${n}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function editHtml() {
    return `
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">${escapeHtml(s.name) || 'Subject'}</h2>
      <form id="subjectForm" autocomplete="off">
        <label class="field">
          <span>Subject name</span>
          <input type="text" name="name" value="${escapeHtml(s.name)}" placeholder="e.g. Mathematics" required>
        </label>
        ${semBlock(1)}
        ${semBlock(2)}
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" id="deleteBtn">Delete</button>
          <button type="button" class="btn btn-primary" id="doneBtn">Done</button>
        </div>
      </form>
    `;
  }

  function mountNew(sheet) {
    const semPicker = sheet.querySelector('#firstGradeSem');
    semPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg');
      if (!btn) return;
      haptic(6);
      firstGradeSem = parseInt(btn.dataset.sem, 10);
      semPicker.querySelectorAll('.seg').forEach(b =>
        b.classList.toggle('active', parseInt(b.dataset.sem, 10) === firstGradeSem));
    });

    const picker = sheet.querySelector('#firstGradeRow');
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-grade]');
      if (!btn) return;
      haptic(8);
      const val = parseInt(btn.dataset.grade, 10);
      firstGrade = (firstGrade === val) ? null : val;
      picker.querySelectorAll('.calc-btn').forEach(b => b.classList.remove('selected'));
      if (firstGrade !== null) {
        picker.querySelector(`[data-grade="${firstGrade}"]`).classList.add('selected');
      }
    });

    sheet.querySelector('#cancelBtn').addEventListener('click', () => { haptic(6); closeSheet(); });

    sheet.querySelector('#subjectForm').addEventListener('submit', (e) => {
      e.preventDefault();
      haptic(12);
      const name = sheet.querySelector('input[name="name"]').value.trim();
      if (!name) return;

      subjects.push({
        id: uid(),
        name,
        grades: firstGrade !== null
          ? [{ id: uid(), value: firstGrade, sem: firstGradeSem }]
          : []
      });
      saveJSON(KEY_SUBJECTS, subjects);
      closeSheet();
      render();
    });
  }

  function mountEdit(sheet) {
    const nameInput = sheet.querySelector('input[name="name"]');
    nameInput.addEventListener('input', () => {
      const v = nameInput.value;
      if (v.trim()) {
        s.name = v;
        saveJSON(KEY_SUBJECTS, subjects);
      }
    });

    sheet.querySelectorAll('.grades-list').forEach(list => {
      list.addEventListener('click', (e) => {
        const chip = e.target.closest('.grade-chip');
        if (!chip) return;
        haptic(10);
        s.grades = s.grades.filter(g => g.id !== chip.dataset.gradeId);
        saveJSON(KEY_SUBJECTS, subjects);
        refreshEdit();
      });
    });

    sheet.querySelectorAll('.add-row').forEach(row => {
      const sem = parseInt(row.dataset.addSem, 10);
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add-grade]');
        if (!btn) return;
        haptic(8);
        s.grades.push({ id: uid(), value: parseInt(btn.dataset.addGrade, 10), sem });
        saveJSON(KEY_SUBJECTS, subjects);
        refreshEdit();
      });
    });

    sheet.querySelector('#deleteBtn').addEventListener('click', () => {
      haptic(15);
      if (!confirm('Delete this subject and all its grades?')) return;
      subjects = subjects.filter(x => x.id !== s.id);
      saveJSON(KEY_SUBJECTS, subjects);
      closeSheet();
      render();
    });

    sheet.querySelector('#doneBtn').addEventListener('click', () => { haptic(6); closeSheet(); render(); });
  }

  function refreshEdit() {
    openSheet(editHtml(), mountEdit);
  }

  if (isNew) openSheet(newHtml(), mountNew);
  else openSheet(editHtml(), mountEdit);
}

// ============ Import / Export ============
function openExportSheet() {
  const json = JSON.stringify(schedule);

  const html = `
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Share schedule</h2>
    <p class="sheet-desc">Send this to a classmate. They paste it into their app with "Import".</p>
    <textarea class="sheet-textarea" readonly id="exportText">${escapeHtml(json)}</textarea>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="closeExport">Close</button>
      <button type="button" class="btn btn-primary" id="copyExport">Copy</button>
    </div>
  `;
  openSheet(html, (sheet) => {
    sheet.querySelector('#closeExport').addEventListener('click', () => { haptic(6); closeSheet(); });
    sheet.querySelector('#copyExport').addEventListener('click', async () => {
      haptic(10);
      try { await navigator.clipboard.writeText(json); }
      catch {
        const t = sheet.querySelector('#exportText');
        t.select(); document.execCommand('copy');
      }
      const btn = sheet.querySelector('#copyExport');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
    });
  });
}

function openImportSheet() {
  const html = `
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Import schedule</h2>
    <p class="sheet-desc">Paste the schedule JSON from a classmate. This will replace your current schedule.</p>
    <textarea class="sheet-textarea" id="importText" placeholder='[{"id":"...","day":0,"start":"08:00","end":"09:00","subject":"Math","room":"A1","colorIndex":0}]'></textarea>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="pasteBtn">Paste</button>
      <button type="button" class="btn btn-ghost" id="cancelImport">Cancel</button>
      <button type="button" class="btn btn-primary" id="importBtn">Import</button>
    </div>
  `;
  openSheet(html, (sheet) => {
    const textarea = sheet.querySelector('#importText');
    sheet.querySelector('#cancelImport').addEventListener('click', () => { haptic(6); closeSheet(); });

    sheet.querySelector('#pasteBtn').addEventListener('click', async () => {
      haptic(8);
      try {
        const t = await navigator.clipboard.readText();
        if (t) textarea.value = t;
      } catch {}
    });

    sheet.querySelector('#importBtn').addEventListener('click', () => {
      haptic(12);
      try {
        let parsed = JSON.parse(textarea.value);
        if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.schedule)) {
          parsed = parsed.schedule;
        }
        if (!Array.isArray(parsed)) throw new Error('Not a valid schedule');
        schedule = parsed.map(item => ({
          id: item.id || uid(),
          day: typeof item.day === 'number' ? item.day : 0,
          start: item.start || '08:00',
          end: item.end || '09:00',
          subject: item.subject || 'Subject',
          room: item.room || '',
          colorIndex: typeof item.colorIndex === 'number' ? item.colorIndex : 0
        }));
        saveJSON(KEY_SCHEDULE, schedule);
        closeSheet();
        render();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    });
  });
}

// ============ View switching ============
function switchView(view) {
  haptic(8);
  currentView = view;
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === view + 'View'));
  render();
}

// ============ Init ============
function init() {
  render();

  document.addEventListener('click', (e) => {
    const target = e.target;

    const dayHeader = target.closest('[data-toggle-day]');
    if (dayHeader) {
      haptic(6);
      const d = parseInt(dayHeader.dataset.toggleDay, 10);
      expandedDay = (expandedDay === d) ? -1 : d;
      renderSchedule();
      return;
    }

    const seg = target.closest('#gradeFilter .seg');
    if (seg) {
      haptic(6);
      const v = seg.dataset.sem;
      gradeFilter = (v === 'all') ? 'all' : parseInt(v, 10);
      saveJSON(KEY_FILTER, gradeFilter);
      render();
      return;
    }

    const tab = target.closest('.tab');
    if (tab) { switchView(tab.dataset.view); return; }

    if (target.closest('#fab')) {
      haptic(10);
      tapPulse(target.closest('#fab'));
      if (currentView === 'schedule') openClassSheet(null);
      else if (currentView === 'tests') openTestSheet(null);
      else openSubjectSheet(null);
      return;
    }

    const action = target.closest('[data-action]');
    if (action) {
      haptic(8);
      if (action.dataset.action === 'import') openImportSheet();
      else if (action.dataset.action === 'export') openExportSheet();
      return;
    }

    const classRow = target.closest('.class-row');
    if (classRow) {
      haptic(6);
      const item = schedule.find(c => c.id === classRow.dataset.id);
      if (item) openClassSheet(item);
      return;
    }

    const testRow = target.closest('.test-row');
    if (testRow) {
      haptic(6);
      const item = tests.find(t => t.id === testRow.dataset.id);
      if (item) openTestSheet(item);
      return;
    }

    const gradeRow = target.closest('.grade-row');
    if (gradeRow) {
      haptic(6);
      const item = subjects.find(s => s.id === gradeRow.dataset.id);
      if (item) openSubjectSheet(item);
      return;
    }

    if (target.id === 'sheetOverlay') { haptic(6); closeSheet(); }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

init();
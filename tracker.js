const GITHUB_WORKER = "https://github-proxy.kmaxim242.workers.dev";
const GITHUB_REPO = "Abema2342/telegrambotdata";
const FILE_NAME = "other.json";

let entries = [];
let calendarData = {};
let fileSha = null;
let currentDate = new Date();

// ===== ЗАГРУЗКА =====
async function loadData() {
  try {
    const res = await fetch(`${GITHUB_WORKER}/github/repos/${GITHUB_REPO}/contents/${FILE_NAME}?_=${Date.now()}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (res.status === 404) {
      entries = []; calendarData = {};
      renderList(); renderCalendar();
      return;
    }

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const meta = await res.json();
    fileSha = meta.sha;
    const raw = atob(meta.content.replace(/\n/g, ''));
    const utf8 = decodeURIComponent(Array.prototype.map.call(raw, c => 
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    const parsed = JSON.parse(utf8);

    if (Array.isArray(parsed)) {
      entries = parsed; calendarData = {};
    } else {
      entries = parsed.logs || [];
      calendarData = parsed.calendar || {};
    }
    
    entries.sort((a, b) => new Date(b.time) - new Date(a.time));
    renderList(); renderCalendar();
  } catch (e) {
    document.getElementById('list-body').innerHTML = `<div class="empty" style="color: var(--danger);">Ошибка загрузки: ${e.message}</div>`;
  }
}

// ===== СОХРАНЕНИЕ =====
async function saveData() {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const payload = { logs: entries, calendar: calendarData };
      const content = JSON.stringify(payload, null, 2);
      const contentBase64 = btoa(unescape(encodeURIComponent(content)));

      const res = await fetch(`${GITHUB_WORKER}/github/repos/${GITHUB_REPO}/contents/${FILE_NAME}`, {
        method: 'PUT',
        headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update tracker log', content: contentBase64, sha: fileSha })
      });

      if (res.status === 409 && attempt < maxRetries - 1) {
        const getRes = await fetch(`${GITHUB_WORKER}/github/repos/${GITHUB_REPO}/contents/${FILE_NAME}?_=${Date.now()}`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (getRes.ok) { const meta = await getRes.json(); fileSha = meta.sha; }
        attempt++; await new Promise(r => setTimeout(r, 300)); continue;
      }

      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      fileSha = data.content.sha;
      return;
    } catch (e) {
      if (attempt >= maxRetries - 1) alert('Ошибка сохранения: ' + e.message);
      attempt++; await new Promise(r => setTimeout(r, 300));
    }
  }
}

// ===== КАЛЕНДАРЬ =====
function changeMonth(offset) {
  currentDate.setMonth(currentDate.getMonth() + offset);
  renderCalendar();
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  
  document.getElementById('calendar-title').textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDay === 0 ? 6 : firstDay - 1;

  let html = '';
  for (let i = 0; i < startDay; i++) html += `<div class="day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    let marks = calendarData[dateStr];
    if (!Array.isArray(marks)) marks = marks ? [marks] : [];

    const isProg = marks.includes('programming');
    const isWrest = marks.includes('wrestling');
    let markClass = '';
    
    if (isProg && isWrest) markClass = 'mixed';
    else if (isProg) markClass = 'programming';
    else if (isWrest) markClass = 'wrestling';

    html += `<div class="day ${markClass}" onclick="cycleDay('${dateStr}')">${day}</div>`;
  }
  document.getElementById('calendar-grid').innerHTML = html;
}

async function cycleDay(dateStr) {
  let marks = calendarData[dateStr];
  if (!Array.isArray(marks)) marks = marks ? [marks] : [];

  const hasProg = marks.includes('programming');
  const hasWrest = marks.includes('wrestling');

  if (!hasProg && !hasWrest) marks = ['programming'];
  else if (hasProg && !hasWrest) marks = ['wrestling'];
  else if (!hasProg && hasWrest) marks = ['programming', 'wrestling'];
  else marks = [];

  if (marks.length === 0) delete calendarData[dateStr];
  else calendarData[dateStr] = marks;
  
  renderCalendar();
  await saveData();
}

// ===== СПИСОК =====
function formatTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function renderList() {
  const body = document.getElementById('list-body');
  if (entries.length === 0) {
    body.innerHTML = '<div class="empty">Нет записей. Нажми «+ Добавить».</div>';
    return;
  }

  body.innerHTML = entries.map((entry, index) => {
    const isArrived = entry.action === 'arrived';
    return `
      <div class="row">
        <div class="col-time">${formatTime(entry.time)}</div>
        <div class="col-action"><span class="badge ${isArrived ? 'badge-arrived' : 'badge-left'}">${isArrived ? 'Пришёл' : 'Ушёл'}</span></div>
        <div class="col-place">${escapeHtml(entry.place)}</div>
        <div class="col-del"><button class="btn-icon" onclick="deleteEntry(${index})">✕</button></div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function addEntry() {
  const timeInput = document.getElementById('input-time').value;
  const action = document.getElementById('input-action').value;
  const place = document.getElementById('input-place').value.trim();

  if (!place) return alert('Напиши место или комментарий.');

  let finalTime;
  if (timeInput) {
    const [hours, minutes] = timeInput.split(':');
    const d = new Date();
    d.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    finalTime = d.toISOString();
  } else {
    finalTime = new Date().toISOString();
  }

  entries.unshift({ time: finalTime, action, place });
  document.getElementById('input-time').value = '';
  document.getElementById('input-place').value = '';
  
  renderList(); toggleForm(); await saveData();
}

// ===== УДАЛЕНИЕ =====
let pendingDeleteIndex = null;

function deleteEntry(index) {
  pendingDeleteIndex = index;
  document.getElementById('confirm-text').textContent = `Удалить запись «${entries[index].place}»?`;
  document.getElementById('confirm-modal').style.display = 'flex';
}

function closeConfirm() {
  pendingDeleteIndex = null;
  document.getElementById('confirm-modal').style.display = 'none';
}

async function executeDelete() {
  if (pendingDeleteIndex === null) return;
  entries.splice(pendingDeleteIndex, 1);
  closeConfirm(); renderList(); await saveData();
}

function toggleForm() {
  const form = document.getElementById('add-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// ===== СТАРТ =====
loadData();
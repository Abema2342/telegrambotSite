const GITHUB_WORKER = "https://github-proxy.kmaxim242.workers.dev";
const GITHUB_REPO = "Abema2342/telegrambotdata";
const FILE_NAME = "other.json";

let entries = [];
let fileSha = null;

// Форматирование времени
function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Загрузка данных
async function loadData() {
  try {
    const res = await fetch(`${GITHUB_WORKER}/github/repos/${GITHUB_REPO}/contents/${FILE_NAME}?_=${Date.now()}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (res.status === 404) {
      entries = [];
      fileSha = null;
      renderList();
      return;
    }

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const meta = await res.json();
    fileSha = meta.sha;
    
    // Декодируем Base64
    const raw = atob(meta.content.replace(/\n/g, ''));
    const utf8 = decodeURIComponent(Array.prototype.map.call(raw, c => 
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    
    entries = JSON.parse(utf8);
    if (!Array.isArray(entries)) entries = [];
    
    // Сортируем по времени (новые сверху)
    entries.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    renderList();
  } catch (e) {
    document.getElementById('list-body').innerHTML = `<div class="empty" style="color: var(--danger);">Ошибка загрузки: ${e.message}</div>`;
  }
}

// Сохранение данных
async function saveData() {
  try {
    const content = JSON.stringify(entries, null, 2);
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));

    const res = await fetch(`${GITHUB_WORKER}/github/repos/${GITHUB_REPO}/contents/${FILE_NAME}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Update tracker log via web',
        content: contentBase64,
        sha: fileSha
      })
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    fileSha = data.content.sha;
  } catch (e) {
    alert('Ошибка сохранения: ' + e.message);
  }
}

// Отрисовка списка
function renderList() {
  const body = document.getElementById('list-body');
  
  if (entries.length === 0) {
    body.innerHTML = '<div class="empty">Нет записей. Нажми «+ Добавить».</div>';
    return;
  }

  body.innerHTML = entries.map((entry, index) => {
    const isArrived = entry.action === 'arrived';
    const badgeClass = isArrived ? 'badge-arrived' : 'badge-left';
    const badgeText = isArrived ? 'Пришёл' : 'Ушёл';
    
    return `
      <div class="row">
        <div class="col-time">${formatTime(entry.time)}</div>
        <div class="col-action"><span class="badge ${badgeClass}">${badgeText}</span></div>
        <div class="col-place">${escapeHtml(entry.place)}</div>
        <div class="col-del">
          <button class="btn-icon" onclick="deleteEntry(${index})" title="Удалить">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Добавление записи
async function addEntry() {
  const timeInput = document.getElementById('input-time').value;
  const action = document.getElementById('input-action').value;
  const place = document.getElementById('input-place').value.trim();

  if (!place) {
    alert('Напиши место или комментарий.');
    return;
  }

  // Если время не выбрано — берем текущее
  let finalTime;
  if (timeInput) {
    const [hours, minutes] = timeInput.split(':');
    const d = new Date();
    d.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    finalTime = d.toISOString();
  } else {
    finalTime = new Date().toISOString();
  }

  const newEntry = { time: finalTime, action, place };
  
  // Добавляем в начало списка
  entries.unshift(newEntry);
  
  // Очищаем форму
  document.getElementById('input-time').value = '';
  document.getElementById('input-place').value = '';
  
  renderList();
  toggleForm(); // Скрываем форму
  await saveData(); // Сохраняем на GitHub
}

// Удаление записи
async function deleteEntry(index) {
  if (!confirm('Удалить эту запись?')) return;
  
  entries.splice(index, 1);
  renderList();
  await saveData();
}

// Показ/скрытие формы
function toggleForm() {
  const form = document.getElementById('add-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// Инициализация
loadData();
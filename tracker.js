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
// Сохранение данных (с защитой от 409)
async function saveData() {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
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

      // Если 409 (конфликт SHA) — пробуем еще раз
      if (res.status === 409 && attempt < maxRetries - 1) {
        console.warn('Конфликт SHA, запрашиваем актуальный...');
        
        // Запрашиваем актуальный SHA
        const getRes = await fetch(`${GITHUB_WORKER}/github/repos/${GITHUB_REPO}/contents/${FILE_NAME}?_=${Date.now()}`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        
        if (getRes.ok) {
          const meta = await getRes.json();
          fileSha = meta.sha; // Обновляем SHA
        }
        
        attempt++;
        await new Promise(r => setTimeout(r, 300)); // Пауза перед повтором
        continue;
      }

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      fileSha = data.content.sha;
      return; // Успешно сохранили

    } catch (e) {
      if (attempt >= maxRetries - 1) {
        alert('Ошибка сохранения: ' + e.message);
      }
      attempt++;
      await new Promise(r => setTimeout(r, 300));
    }
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
let pendingDeleteIndex = null;

function deleteEntry(index) {
  pendingDeleteIndex = index;
  const entry = entries[index];
  document.getElementById('confirm-text').textContent = `Удалить запись «${entry.place}»?`;
  document.getElementById('confirm-modal').style.display = 'flex';
}

function closeConfirm() {
  pendingDeleteIndex = null;
  document.getElementById('confirm-modal').style.display = 'none';
}

async function executeDelete() {
  if (pendingDeleteIndex === null) return;
  
  entries.splice(pendingDeleteIndex, 1);
  closeConfirm();
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
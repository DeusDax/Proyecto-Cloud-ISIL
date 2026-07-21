const API = '/api';
const ticketForm = document.getElementById('ticketForm');
const ticketResult = document.getElementById('ticketResult');
const searchForm = document.getElementById('searchForm');
const searchResult = document.getElementById('searchResult');

function formatDate(value) {
  return new Date(value).toLocaleString('es-PE', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function showBox(element, html) {
  element.innerHTML = html;
  element.classList.add('show');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

async function loadSession() {
  const response = await fetch(`${API}/auth/me`);
  if (!response.ok) return;
  const data = await response.json();
  const destination = data.user.role === 'admin' ? '/admin' : '/mi-cuenta';
  document.getElementById('accountLink').href = destination;
  document.getElementById('accountLink').textContent = data.user.role === 'admin' ? 'Administración' : 'Mi cuenta';
  document.getElementById('sessionButton').href = destination;
  document.getElementById('sessionButton').textContent = `Hola, ${data.user.nombre}`;
}

ticketForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(ticketForm).entries());

  try {
    const res = await fetch(`${API}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    if (res.status === 401) {
      window.location.assign('/acceso.html');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'No se pudo crear el ticket');

    showBox(ticketResult, `
      <strong>Ticket creado correctamente</strong><br>
      Código: <strong>${escapeHtml(data.id)}</strong><br>
      Estado inicial: ${escapeHtml(data.estado)}<br>
      Prioridad: ${escapeHtml(data.prioridad)}<br>
      Fecha: ${formatDate(data.fecha)}
    `);
    ticketForm.reset();
  } catch (error) {
    showBox(ticketResult, `<strong>Error:</strong> ${error.message}`);
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = new FormData(searchForm).get('ticketId').trim();

  try {
    const res = await fetch(`${API}/tickets/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (res.status === 401) {
      window.location.assign('/acceso.html');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'No se encontró el ticket');

    showBox(searchResult, `
      <strong>${escapeHtml(data.id)}</strong><br>
      Cliente: ${escapeHtml(data.empresa)}<br>
      Solicitante: ${escapeHtml(data.nombre)}<br>
      Servicio: ${escapeHtml(data.servicio)}<br>
      Prioridad: <span class="badge ${escapeHtml(data.prioridad)}">${escapeHtml(data.prioridad)}</span><br>
      Estado: <strong>${escapeHtml(data.estado)}</strong><br>
      Fecha de registro: ${formatDate(data.fecha)}<br><br>
      <em>${escapeHtml(data.descripcion)}</em>
    `);
  } catch (error) {
    showBox(searchResult, `<strong>Resultado:</strong> ${error.message}`);
  }
});

loadSession();

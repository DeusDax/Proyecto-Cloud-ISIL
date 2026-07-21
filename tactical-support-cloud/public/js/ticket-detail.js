const statuses = ['Pendiente', 'En proceso', 'Escalado', 'Atendido', 'Cerrado'];
const ticketId = decodeURIComponent(window.location.pathname.split('/').pop());
let currentTicket;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatDate(value) {
  if (!value) return 'Sin registro';
  return new Date(value).toLocaleString('es-PE', { year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function adminFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401 || response.status === 403) {
    window.location.replace('/acceso.html');
    throw new Error('La sesión ha finalizado.');
  }
  return response;
}

function detailItem(label, value, wide = false) {
  return `<article class="detail-item ${wide ? 'wide' : ''}"><span>${label}</span><strong>${escapeHtml(value || 'No registrado')}</strong></article>`;
}

function renderUpdateHistory(updates = []) {
  const history = document.getElementById('updateHistory');
  if (!updates.length) {
    history.innerHTML = '<div class="empty-history">Todavía no se han registrado avances para este ticket.</div>';
    return;
  }
  history.innerHTML = [...updates].reverse().map(update => `<article class="update-entry">
    <div class="update-meta"><strong>${escapeHtml(update.authorName || 'Administrador')}</strong><time>${formatDate(update.createdAt)}</time></div>
    <p>${escapeHtml(update.note).replace(/\n/g, '<br>')}</p>
  </article>`).join('');
}

function renderTicket(ticket) {
  currentTicket = ticket;
  document.title = `${ticket.id} | Tactical Support Cloud`;
  document.getElementById('ticketTitle').textContent = ticket.id;
  document.getElementById('ticketDate').textContent = `Registrado el ${formatDate(ticket.fecha)}`;
  document.getElementById('ticketStatus').textContent = ticket.estado;
  document.getElementById('ticketDetail').innerHTML = [
    detailItem('Solicitante', ticket.nombre),
    detailItem('Empresa / Cliente', ticket.empresa),
    detailItem('Correo electrónico', ticket.correo),
    detailItem('Teléfono', ticket.telefono),
    detailItem('Tipo de servicio', ticket.servicio),
    detailItem('Prioridad', ticket.prioridad),
    detailItem('Descripción del problema', ticket.descripcion, true),
    detailItem('Última actualización', formatDate(ticket.actualizado), true)
  ].join('');
  document.getElementById('detailStatus').innerHTML = statuses.map(status => `<option value="${status}" ${ticket.estado === status ? 'selected' : ''}>${status}</option>`).join('');
  renderUpdateHistory(ticket.updates);
}

async function loadTicket() {
  const response = await adminFetch(`/api/tickets/${encodeURIComponent(ticketId)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar el ticket.');
  renderTicket(data);
}

document.getElementById('saveStatus').addEventListener('click', async () => {
  const result = document.getElementById('detailResult');
  try {
    const response = await adminFetch(`/api/tickets/${encodeURIComponent(currentTicket.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: document.getElementById('detailStatus').value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el estado.');
    renderTicket(data);
    result.textContent = 'Estado actualizado correctamente.';
    result.classList.add('show');
    result.classList.remove('error');
  } catch (error) {
    result.textContent = error.message;
    result.classList.add('show', 'error');
  }
});

const updateNote = document.getElementById('updateNote');
updateNote.addEventListener('input', () => {
  document.getElementById('noteCounter').textContent = `${updateNote.value.length} / 2000`;
});

document.getElementById('saveUpdate').addEventListener('click', async event => {
  const result = document.getElementById('updateResult');
  const note = updateNote.value.trim();
  event.currentTarget.disabled = true;
  try {
    const response = await adminFetch(`/api/tickets/${encodeURIComponent(currentTicket.id)}/updates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo registrar el avance.');
    renderTicket(data.ticket);
    updateNote.value = '';
    document.getElementById('noteCounter').textContent = '0 / 2000';
    result.textContent = 'Avance agregado correctamente.';
    result.classList.add('show');
    result.classList.remove('error');
  } catch (error) {
    result.textContent = error.message;
    result.classList.add('show', 'error');
  } finally {
    event.currentTarget.disabled = false;
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.replace('/acceso.html');
});

loadTicket().catch(error => {
  document.getElementById('ticketTitle').textContent = 'No se pudo mostrar el ticket';
  document.getElementById('ticketDetail').innerHTML = detailItem('Error', error.message, true);
});

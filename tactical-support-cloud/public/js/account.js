function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatDate(value) {
  return new Date(value).toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function requireSession(url) {
  const response = await fetch(url);
  if (response.status === 401 || response.status === 403) {
    window.location.replace('/acceso.html');
    throw new Error('Sesión no disponible.');
  }
  return response;
}

function renderTickets(tickets) {
  document.getElementById('totalTickets').textContent = tickets.length;
  document.getElementById('pendingTickets').textContent = tickets.filter(ticket => ticket.estado === 'Pendiente').length;
  document.getElementById('progressTickets').textContent = tickets.filter(ticket => ['En proceso', 'Escalado'].includes(ticket.estado)).length;
  document.getElementById('closedTickets').textContent = tickets.filter(ticket => ['Atendido', 'Cerrado'].includes(ticket.estado)).length;
  const table = document.getElementById('userTicketTable');
  if (!tickets.length) {
    table.innerHTML = '<tr><td colspan="6">Todavía no tienes tickets registrados.</td></tr>';
    return;
  }
  table.innerHTML = tickets.map(ticket => `<tr>
    <td><strong>${escapeHtml(ticket.id)}</strong></td>
    <td>${escapeHtml(ticket.servicio)}</td>
    <td><span class="badge ${escapeHtml(ticket.prioridad)}">${escapeHtml(ticket.prioridad)}</span></td>
    <td>${escapeHtml(ticket.estado)}</td>
    <td>${formatDate(ticket.fecha)}</td>
    <td>${escapeHtml(ticket.descripcion)}</td>
  </tr>`).join('');
}

document.getElementById('logoutButton').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.replace('/acceso.html');
});

(async () => {
  const profile = await requireSession('/api/auth/me').then(response => response.json());
  if (profile.user.role === 'admin') return window.location.replace('/admin');
  document.getElementById('userName').textContent = profile.user.nombre;
  const tickets = await requireSession('/api/my-tickets').then(response => response.json());
  renderTickets(tickets);
})().catch(() => {});

const ticketTable = document.getElementById('ticketTable');
const allowedStatuses = ['Pendiente', 'En proceso', 'Escalado', 'Atendido', 'Cerrado'];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatDate(value) {
  return new Date(value).toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function authenticatedFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401 || response.status === 403) {
    window.location.replace('/acceso.html');
    throw new Error('La sesión ha finalizado.');
  }
  return response;
}

function updateMetrics(tickets) {
  document.getElementById('totalTickets').textContent = tickets.length;
  document.getElementById('pendingTickets').textContent = tickets.filter(ticket => ticket.estado === 'Pendiente').length;
  document.getElementById('progressTickets').textContent = tickets.filter(ticket => ['En proceso', 'Escalado'].includes(ticket.estado)).length;
  document.getElementById('closedTickets').textContent = tickets.filter(ticket => ['Cerrado', 'Atendido'].includes(ticket.estado)).length;
  renderAnalytics(tickets);
}

function countBy(items, key, values) {
  return Object.fromEntries(values.map(value => [value, items.filter(item => item[key] === value).length]));
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const hours = milliseconds / 3600000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}

function renderBarChart(elementId, data, colors) {
  const element = document.getElementById(elementId);
  const maximum = Math.max(1, ...Object.values(data));
  element.innerHTML = Object.entries(data).map(([label, value], index) => `<div class="bar-row">
    <div class="bar-label"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
    <div class="bar-track"><i style="width:${(value / maximum) * 100}%;background:${colors[index % colors.length]}"></i></div>
  </div>`).join('');
}

function renderPriorityChart(tickets) {
  const priorities = ['Crítica', 'Alta', 'Media', 'Baja'];
  const colors = ['#ef4444', '#ff5a1f', '#facc15', '#22c55e'];
  const data = countBy(tickets, 'prioridad', priorities);
  const total = tickets.length;
  let cursor = 0;
  const segments = priorities.map((priority, index) => {
    const start = cursor;
    cursor += total ? (data[priority] / total) * 100 : 0;
    return `${colors[index]} ${start}% ${cursor}%`;
  });
  document.getElementById('priorityDonut').style.background = total ? `conic-gradient(${segments.join(',')})` : 'rgba(255,255,255,.1)';
  document.getElementById('priorityTotal').textContent = total;
  document.getElementById('priorityLegend').innerHTML = priorities.map((priority, index) => `<div><i style="background:${colors[index]}"></i><span>${priority}</span><strong>${data[priority]}</strong></div>`).join('');
}

function renderServiceChart(tickets) {
  const counts = tickets.reduce((result, ticket) => {
    result[ticket.servicio] = (result[ticket.servicio] || 0) + 1;
    return result;
  }, {});
  const ordered = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6));
  if (!Object.keys(ordered).length) ordered['Sin solicitudes'] = 0;
  renderBarChart('serviceChart', ordered, ['#ff5a1f', '#ff8a52', '#7c3aed', '#a855f7', '#39b5c8', '#22c55e']);
}

function renderAnalytics(tickets) {
  const resolved = tickets.filter(ticket => ['Atendido', 'Cerrado'].includes(ticket.estado));
  const open = tickets.length - resolved.length;
  const durations = resolved.map(ticket => new Date(ticket.resolvedAt || ticket.actualizado || ticket.fecha) - new Date(ticket.fecha)).filter(value => value >= 0);
  const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : NaN;
  const slaHours = { 'Crítica': 4, Alta: 8, Media: 24, Baja: 48 };
  const measurable = resolved.filter(ticket => slaHours[ticket.prioridad]);
  const withinSla = measurable.filter(ticket => {
    const duration = new Date(ticket.resolvedAt || ticket.actualizado || ticket.fecha) - new Date(ticket.fecha);
    return duration <= slaHours[ticket.prioridad] * 3600000;
  }).length;

  document.getElementById('resolvedCases').textContent = resolved.length;
  document.getElementById('resolutionRate').textContent = tickets.length ? `${Math.round((resolved.length / tickets.length) * 100)}%` : '0%';
  document.getElementById('averageResolution').textContent = formatDuration(average);
  document.getElementById('slaCompliance').textContent = measurable.length ? `${Math.round((withinSla / measurable.length) * 100)}%` : '—';
  document.getElementById('openCases').textContent = `${open} ${open === 1 ? 'abierto' : 'abiertos'}`;

  renderBarChart('statusChart', countBy(tickets, 'estado', allowedStatuses), ['#ff5a1f', '#a855f7', '#facc15', '#39b5c8', '#22c55e']);
  renderPriorityChart(tickets);
  renderServiceChart(tickets);
}

function renderTable(tickets) {
  if (!tickets.length) {
    ticketTable.innerHTML = '<tr><td colspan="6">No hay tickets registrados.</td></tr>';
    return;
  }
  ticketTable.innerHTML = tickets.map(ticket => `
    <tr>
      <td><strong>${escapeHtml(ticket.id)}</strong><br><small>${formatDate(ticket.fecha)}</small></td>
      <td>${escapeHtml(ticket.empresa)}<br><small>${escapeHtml(ticket.nombre)}</small></td>
      <td>${escapeHtml(ticket.servicio)}</td>
      <td><span class="badge ${escapeHtml(ticket.prioridad)}">${escapeHtml(ticket.prioridad)}</span></td>
      <td>${escapeHtml(ticket.estado)}</td>
      <td><div class="ticket-actions"><select class="status-select" data-id="${escapeHtml(ticket.id)}">${allowedStatuses.map(status => `<option value="${status}" ${ticket.estado === status ? 'selected' : ''}>${status}</option>`).join('')}</select><a class="btn secondary detail-button" href="/admin/tickets/${encodeURIComponent(ticket.id)}">Ver detalle</a></div></td>
    </tr>`).join('');

  document.querySelectorAll('.status-select').forEach(select => select.addEventListener('change', async event => {
    const response = await authenticatedFetch(`/api/tickets/${encodeURIComponent(event.target.dataset.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: event.target.value })
    });
    if (!response.ok) {
      const data = await response.json();
      document.getElementById('adminResult').textContent = data.error || 'No se pudo actualizar el ticket.';
      document.getElementById('adminResult').classList.add('show', 'error');
    }
    await loadDashboard();
  }));
}

async function loadDashboard() {
  const response = await authenticatedFetch('/api/tickets');
  const tickets = await response.json();
  updateMetrics(tickets);
  renderTable(tickets);
}

function showUserResult(message, isError = false) {
  const result = document.getElementById('userResult');
  result.textContent = message;
  result.classList.add('show');
  result.classList.toggle('error', isError);
}

function renderUsers(users) {
  const table = document.getElementById('userTable');
  if (!users.length) {
    table.innerHTML = '<tr><td colspan="6">No hay usuarios registrados.</td></tr>';
    return;
  }
  table.innerHTML = users.map(user => `<tr data-user-id="${escapeHtml(user.id)}">
    <td><input class="user-name" value="${escapeHtml(user.nombre)}" aria-label="Nombre de ${escapeHtml(user.username)}" /></td>
    <td><input class="user-username" value="${escapeHtml(user.username)}" aria-label="Usuario" /></td>
    <td><select class="user-role" aria-label="Rol"><option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option></select></td>
    <td>${formatDate(user.createdAt)}</td>
    <td><input class="user-password" type="password" minlength="8" placeholder="Sin cambios" aria-label="Nueva contraseña" /></td>
    <td><button class="btn primary save-user" type="button">Guardar</button></td>
  </tr>`).join('');

  document.querySelectorAll('.save-user').forEach(button => button.addEventListener('click', async event => {
    const row = event.currentTarget.closest('tr');
    const payload = {
      nombre: row.querySelector('.user-name').value,
      username: row.querySelector('.user-username').value,
      role: row.querySelector('.user-role').value,
      password: row.querySelector('.user-password').value
    };
    event.currentTarget.disabled = true;
    try {
      const response = await authenticatedFetch(`/api/users/${encodeURIComponent(row.dataset.userId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el usuario.');
      showUserResult(data.message);
      await loadUsers();
    } catch (error) {
      showUserResult(error.message, true);
    } finally {
      event.currentTarget.disabled = false;
    }
  }));
}

async function loadUsers() {
  const response = await authenticatedFetch('/api/users');
  const users = await response.json();
  renderUsers(users);
}

document.getElementById('logoutButton').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.replace('/acceso.html');
});

(async () => {
  const response = await authenticatedFetch('/api/auth/me');
  const data = await response.json();
  document.getElementById('adminName').textContent = data.user.nombre;
  await Promise.all([loadDashboard(), loadUsers()]);
})().catch(() => {});

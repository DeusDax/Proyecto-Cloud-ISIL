const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tickets.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SESSION_COOKIE = 'tsc_session_v2';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function readUsers() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error leyendo usuarios:', error);
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function loadSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return;
  try {
    const stored = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    for (const [token, session] of Object.entries(stored)) {
      if (session.expiresAt > Date.now()) sessions.set(token, session);
    }
  } catch (error) {
    console.error('Error leyendo sesiones:', error);
  }
}

function saveSessions() {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions), null, 2), 'utf8');
}

function ensureDefaultAdmin() {
  const users = readUsers();
  if (users.some(user => user.username.toLowerCase() === 'admin')) return;
  users.push({
    id: crypto.randomUUID(),
    nombre: 'Administrador',
    username: 'admin',
    passwordHash: hashPassword('admin123'),
    role: 'admin',
    createdAt: new Date().toISOString()
  });
  saveUsers(users);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').filter(Boolean).map(item => {
    const index = item.indexOf('=');
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }));
}

function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) {
      sessions.delete(token);
      saveSessions();
    }
    return null;
  }
  return session.user;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Acceso administrativo requerido.' });
    return res.redirect('/acceso.html');
  }
  req.user = user;
  next();
}

ensureDefaultAdmin();
loadSessions();

app.get('/admin', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/admin/tickets/:id', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'ticket-detail.html'));
});

app.get('/mi-cuenta', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.redirect('/acceso.html');
  if (user.role === 'admin') return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'views', 'account.html'));
});

app.post('/api/auth/register', (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (nombre.length < 2 || !/^[a-z0-9._-]{3,30}$/.test(username) || password.length < 8) {
    return res.status(400).json({ error: 'Verifica el nombre, usuario y contraseña (mínimo 8 caracteres).' });
  }
  const users = readUsers();
  if (users.some(user => user.username.toLowerCase() === username)) {
    return res.status(409).json({ error: 'El nombre de usuario ya está registrado.' });
  }
  users.push({ id: crypto.randomUUID(), nombre, username, passwordHash: hashPassword(password), role: 'user', createdAt: new Date().toISOString() });
  saveUsers(users);
  res.status(201).json({ message: 'Usuario registrado correctamente. Ya puedes iniciar sesión.' });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = readUsers().find(item => item.username.toLowerCase() === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const safeUser = { id: user.id, nombre: user.nombre, username: user.username, role: user.role };
  sessions.set(token, { user: safeUser, expiresAt: Date.now() + SESSION_TTL_MS });
  saveSessions();
  const forwardedProtocol = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const secureCookie = req.secure || forwardedProtocol === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secureCookie}`);
  res.json({ user: safeUser, redirect: user.role === 'admin' ? '/admin' : '/mi-cuenta' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
    saveSessions();
  }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ message: 'Sesión cerrada.' });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado.' });
  res.json({ user });
});

app.get('/api/users', requireAdmin, (_req, res) => {
  const users = readUsers().map(({ passwordHash, ...user }) => user);
  res.json(users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const users = readUsers();
  const index = users.findIndex(user => user.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const nombre = String(req.body.nombre || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const role = String(req.body.role || '');
  const password = String(req.body.password || '');

  if (nombre.length < 2 || !/^[a-z0-9._-]{3,30}$/.test(username) || !['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Los datos del usuario no son válidos.' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  if (users.some((user, userIndex) => userIndex !== index && user.username.toLowerCase() === username)) {
    return res.status(409).json({ error: 'El nombre de usuario ya está registrado.' });
  }

  const current = users[index];
  const adminCount = users.filter(user => user.role === 'admin').length;
  if (current.role === 'admin' && role !== 'admin' && adminCount === 1) {
    return res.status(400).json({ error: 'No puedes cambiar el rol del último administrador.' });
  }

  current.nombre = nombre;
  current.username = username;
  current.role = role;
  current.updatedAt = new Date().toISOString();
  if (password) current.passwordHash = hashPassword(password);
  saveUsers(users);

  for (const [token, session] of sessions) {
    if (session.user.id !== current.id) continue;
    if (password) {
      sessions.delete(token);
    } else {
      session.user = { id: current.id, nombre: current.nombre, username: current.username, role: current.role };
    }
  }
  saveSessions();
  const { passwordHash, ...safeUser } = current;
  res.json({ user: safeUser, message: 'Usuario actualizado correctamente.' });
});

function readTickets() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error leyendo tickets:', error);
    return [];
  }
}

function saveTickets(tickets) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2), 'utf8');
}

function generateTicketId(tickets) {
  const year = new Date().getFullYear();
  const highest = tickets.reduce((max, ticket) => {
    const match = String(ticket.id || '').match(new RegExp(`^TSC-${year}-(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const next = String(highest + 1).padStart(4, '0');
  return `TSC-${year}-${next}`;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Tactical Support Cloud', timestamp: new Date().toISOString() });
});

app.get('/api/tickets', requireAdmin, (_req, res) => {
  const tickets = readTickets().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  res.json(tickets);
});

app.get('/api/my-tickets', requireAuth, (req, res) => {
  const tickets = readTickets()
    .filter(ticket => ticket.userId === req.user.id)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  res.json(tickets);
});

app.get('/api/tickets/:id', requireAuth, (req, res) => {
  const id = req.params.id.trim().toUpperCase();
  const ticket = readTickets().find(t => t.id.toUpperCase() === id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user.role !== 'admin' && ticket.userId !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso para consultar este ticket.' });
  }
  res.json(ticket);
});

app.post('/api/tickets', requireAuth, (req, res) => {
  const { nombre, empresa, correo, telefono, servicio, prioridad, descripcion } = req.body;

  if (!nombre || !empresa || !correo || !telefono || !servicio || !prioridad || !descripcion) {
    return res.status(400).json({ error: 'Completa todos los campos obligatorios.' });
  }

  const tickets = readTickets();
  const ticket = {
    id: generateTicketId(tickets),
    userId: req.user.id,
    nombre: String(nombre).trim(),
    empresa: String(empresa).trim(),
    correo: String(correo).trim(),
    telefono: String(telefono).trim(),
    servicio: String(servicio).trim(),
    prioridad: String(prioridad).trim(),
    descripcion: String(descripcion).trim(),
    estado: 'Pendiente',
    fecha: new Date().toISOString()
  };

  tickets.push(ticket);
  saveTickets(tickets);
  res.status(201).json(ticket);
});

app.patch('/api/tickets/:id', requireAdmin, (req, res) => {
  const id = req.params.id.trim().toUpperCase();
  const { estado } = req.body;
  const estadosPermitidos = ['Pendiente', 'En proceso', 'Escalado', 'Atendido', 'Cerrado'];

  if (!estadosPermitidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado no permitido.' });
  }

  const tickets = readTickets();
  const index = tickets.findIndex(t => t.id.toUpperCase() === id);
  if (index === -1) return res.status(404).json({ error: 'Ticket no encontrado' });

  tickets[index].estado = estado;
  tickets[index].actualizado = new Date().toISOString();
  if (['Atendido', 'Cerrado'].includes(estado) && !tickets[index].resolvedAt) {
    tickets[index].resolvedAt = tickets[index].actualizado;
  }
  if (!['Atendido', 'Cerrado'].includes(estado)) {
    delete tickets[index].resolvedAt;
  }
  saveTickets(tickets);
  res.json(tickets[index]);
});

app.post('/api/tickets/:id/updates', requireAdmin, (req, res) => {
  const id = req.params.id.trim().toUpperCase();
  const note = String(req.body.note || '').trim();
  if (note.length < 3 || note.length > 2000) {
    return res.status(400).json({ error: 'La nota debe tener entre 3 y 2000 caracteres.' });
  }

  const tickets = readTickets();
  const index = tickets.findIndex(ticket => ticket.id.toUpperCase() === id);
  if (index === -1) return res.status(404).json({ error: 'Ticket no encontrado.' });

  const update = {
    id: crypto.randomUUID(),
    note,
    authorId: req.user.id,
    authorName: req.user.nombre,
    createdAt: new Date().toISOString()
  };
  if (!Array.isArray(tickets[index].updates)) tickets[index].updates = [];
  tickets[index].updates.push(update);
  tickets[index].actualizado = update.createdAt;
  saveTickets(tickets);
  res.status(201).json({ update, ticket: tickets[index] });
});

app.listen(PORT, () => {
  console.log(`Tactical Support Cloud ejecutándose en http://localhost:${PORT}`);
});

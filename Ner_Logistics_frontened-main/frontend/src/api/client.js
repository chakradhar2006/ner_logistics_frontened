// Thin fetch wrapper for the NER Logistics backend.
// Set VITE_API_URL in a .env file at the project root (see SETUP_GUIDE.md),
// e.g. VITE_API_URL=http://localhost:5000

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('nerToken');
}
export function setToken(token) {
  if (token) localStorage.setItem('nerToken', token);
  else localStorage.removeItem('nerToken');
}

async function request(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/* ---------- Auth ---------- */
export const authApi = {
  register: (payload, photoFile) => {
    if (photoFile) {
      const form = new FormData();
      Object.entries(payload).forEach(([k, v]) => form.append(k, v));
      form.append('vehiclePhoto', photoFile);
      return request('/api/auth/register', { method: 'POST', body: form, isForm: true, auth: false });
    }
    return request('/api/auth/register', { method: 'POST', body: payload, auth: false });
  },
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/api/auth/me'),
};

/* ---------- Vehicles ---------- */
export const vehicleApi = {
  list: () => request('/api/vehicles'),
  get: (id) => request(`/api/vehicles/${id}`),
  create: (payload) => request('/api/vehicles', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/api/vehicles/${id}`, { method: 'PATCH', body: payload }),
  remove: (id) => request(`/api/vehicles/${id}`, { method: 'DELETE' }),
  route: (id) => request(`/api/vehicles/${id}/route`),
};

/* ---------- Deliveries ---------- */
export const deliveryApi = {
  list: (query = '') => request(`/api/deliveries${query}`),
  districts: () => request('/api/deliveries/meta/districts'),
  create: (payload) => request('/api/deliveries', { method: 'POST', body: payload }),
  updateStatus: (id, payload) => request(`/api/deliveries/${id}/status`, { method: 'PATCH', body: payload }),
  disrupted: () => request('/api/deliveries/disrupted'),
  recoveryOptions: (id) => request(`/api/deliveries/${id}/recovery-options`),
  applyRecovery: (id, payload) => request(`/api/deliveries/${id}/apply-recovery`, { method: 'POST', body: payload }),
};

/* ---------- Roads ---------- */
export const roadApi = {
  list: (query = '') => request(`/api/roads${query}`),
  districts: () => request('/api/roads/meta/districts'),
  create: (payload) => request('/api/roads', { method: 'POST', body: payload }),
  updateStatus: (id, payload) => request(`/api/roads/${id}/status`, { method: 'PATCH', body: payload }),
};

/* ---------- Incidents ---------- */
export const incidentApi = {
  list: (query = '') => request(`/api/incidents${query}`),
  get: (id) => request(`/api/incidents/${id}`),
  create: (fields, photoFile) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => v !== undefined && form.append(k, v));
    if (photoFile) form.append('photo', photoFile);
    return request('/api/incidents', { method: 'POST', body: form, isForm: true });
  },
  updateStatus: (id, status) => request(`/api/incidents/${id}/status`, { method: 'PATCH', body: { status } }),
};

/* ---------- Alerts ---------- */
export const alertApi = {
  list: (limit = 20) => request(`/api/alerts?limit=${limit}`),
  create: (payload) => request('/api/alerts', { method: 'POST', body: payload }),
  markRead: (id) => request(`/api/alerts/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/api/alerts/mark-all-read', { method: 'POST' }),
};

/* ---------- Reports ---------- */
export const reportApi = {
  list: () => request('/api/reports'),
  generate: (payload) => request('/api/reports/generate', { method: 'POST', body: payload }),
};

/* ---------- Sync ---------- */
export const syncApi = {
  status: () => request('/api/sync/status'),
  queue: (payload) => request('/api/sync/queue', { method: 'POST', body: payload }),
  run: () => request('/api/sync/run', { method: 'POST' }),
};

/* ---------- Route optimization (Google Maps) ---------- */
export const routeApi = {
  optimize: (payload) => request('/api/routes/optimize', { method: 'POST', body: payload }),
  history: () => request('/api/routes/history'),
};

/* ---------- Weather + disaster data ---------- */
export const weatherApi = {
  current: (lat, lon) => request(`/api/weather/current?lat=${lat}&lon=${lon}`),
  disasterFeed: () => request('/api/weather/disaster-feed'),
};

/* ---------- Velocity AI chatbot ---------- */
export const velocityApi = {
  chat: (message) => request('/api/velocity/chat', { method: 'POST', body: { message } }),
};

/* ---------- Settings ---------- */
export const settingsApi = {
  get: () => request('/api/settings'),
  update: (payload) => request('/api/settings', { method: 'PUT', body: payload }),
};

/* ---------- Realtime (Server-Sent Events) ---------- */
// Returns an EventSource the caller is responsible for closing, or null if
// there's no token yet (e.g. before login). EventSource can't send an
// Authorization header, so the token travels as a query param instead —
// the server verifies it the same way as every other protected route.
export function openEventStream() {
  const token = getToken();
  if (!token) return null;
  return new EventSource(`${BASE_URL}/api/events/stream?token=${encodeURIComponent(token)}`);
}

export { BASE_URL };

export function fileUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : `${BASE_URL}${path}`;
}

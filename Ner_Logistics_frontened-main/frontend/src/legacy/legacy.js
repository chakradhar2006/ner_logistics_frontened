// This module ports the reference prototype's vanilla-JS interactions
// (navigation, tabs, uploads, chat, weather, profile) so the exact markup
// extracted from the reference can stay functional inside React.

import {
  authApi,
  setToken,
  incidentApi,
  velocityApi,
  vehicleApi,
  deliveryApi,
  roadApi,
  alertApi,
  reportApi,
  routeApi,
  syncApi,
  settingsApi,
  weatherApi,
  openEventStream,
  fileUrl,
} from '../api/client.js';
import { queueOfflineIncident, listOfflineQueue, flushOfflineQueue, offlineQueueCounts } from './offlineQueue.js';
import { getLanguage, setLanguage, applyTranslations, initLanguage, onLanguageChange, t } from '../i18n/i18n.js';
import { LANGUAGES } from '../i18n/languages.js';

const ROUTES = {
  login: '/login',
  register: '/register',
  dashboard: '/dashboard',
  roads: '/roads',
  vehicles: '/vehicles',
  routeopt: '/route-optimization',
  velocity: '/velocity',
  weather: '/weather',
  profile: '/profile',
  settings: '/settings',
  report: '/report',
  sync: '/sync',
  alerts: '/alerts',
  deliveries: '/deliveries',
  reports: '/reports',
};

let navigateFn = null;
export function setNavigate(fn) {
  navigateFn = fn;
}

export function toggleMobileMore(open) {
  const p = document.getElementById('mobileMorePanel');
  if (p) p.classList.toggle('open', !!open);
}

// goto() is attached to window so the onclick="goto('x')" attributes that
// live inside the extracted HTML fragments keep working untouched.
export function goto(page) {
  toggleMobileMore(false);
  if (page === 'profile') populateAccountProfile();
  const path = ROUTES[page] || '/dashboard';
  if (navigateFn) navigateFn(path);
}

export function installGlobalBindings() {
  window.goto = goto;
  window.toggleMobileMore = toggleMobileMore;
  window.detectLocation = detectLocation;
  window.geotagIncident = geotagIncident;
  window.setRegisterDriver = setRegisterDriver;
  window.handleRegisterSubmit = handleRegisterSubmit;
  window.handleLoginSubmit = handleLoginSubmit;
  window.velSend = velSend;
  window.velSendQuick = velSendQuick;
  window.fetchLiveWeather = fetchLiveWeather;
  window.showServiceUnavailable = showServiceUnavailable;
  installConnectivityListeners(document);
  ensureEventStream();
  initLanguage().then(() => wireLanguageSwitcher(document));
  onLanguageChange(() => {
    // Re-render any already-rendered dynamic lists whose text (tag chips,
    // relative timestamps) was baked in at render time rather than tagged
    // with data-i18n, so switching language updates them live too.
    if (document.getElementById('alertsListDesktop')) renderFilteredAlerts();
    const dashList = document.getElementById('dashboardAlertsListDesktop');
    if (dashList && dashList.children.length) loadDashboardData(document).catch(() => {});
  });

  // The "Good morning/afternoon/evening" greeting is only computed when the
  // Dashboard page mounts — if someone leaves it open across a time-of-day
  // boundary (e.g. a shift that runs from morning into afternoon), it would
  // otherwise go stale. Recheck once a minute; renderDashboardGreeting()
  // no-ops safely if the dashboard isn't currently on screen.
  if (!window.__nerGreetingInterval) {
    window.__nerGreetingInterval = setInterval(renderDashboardGreeting, 60000);
  }
}

function wireLanguageSwitcher(root) {
  const btn = document.getElementById('langSwitcherBtn');
  const menu = document.getElementById('langSwitcherMenu');
  const label = document.getElementById('langSwitcherLabel');
  if (!btn || !menu) return;

  const renderMenu = () => {
    const current = getLanguage();
    menu.innerHTML =
      LANGUAGES.map(
        (l) =>
          `<div class="lang-menu-item${l.code === current ? ' active' : ''}" data-lang="${l.code}">` +
          `<span>${escapeHtml(l.name)}</span><span class="native">${escapeHtml(l.native)}</span></div>`
      ).join('') +
      '<div class="lang-menu-note">Regional-language translations are AI-generated and cover navigation and page labels. Live data (incident reports, alerts) stays in the language it was entered.</div>';
    if (label) label.textContent = current.toUpperCase();
  };
  renderMenu();

  if (!btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
    menu.addEventListener('click', async (e) => {
      const item = e.target.closest('.lang-menu-item');
      if (!item) return;
      e.stopPropagation();
      await setLanguage(item.dataset.lang);
      renderMenu();
      menu.classList.remove('open');
    });
  }
}

// A small, honest way to surface "this needs an external service that isn't
// configured" instead of either faking success or silently doing nothing —
// used by Send OTP / License Verify, which need providers this prototype
// doesn't ship credentials for (see backend/.env.example).
function showServiceUnavailable(btn, message) {
  if (!btn) return;
  const group = btn.closest('.field-group');
  if (!group) return;
  let note = group.querySelector('.service-unavailable-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'field-hint service-unavailable-note';
    note.style.color = 'var(--danger)';
    group.appendChild(note);
  }
  note.textContent = message;
}

/* ---------- Role tabs (login / register) ---------- */
// Both the desktop and mobile fragments are present in the DOM at once
// (CSS media queries just hide one of them), so a plain
// querySelector('[data-role-panel="x"]') can grab the hidden copy. This picks
// the one that's actually laid out on screen.
function getVisiblePanel(role) {
  const panels = document.querySelectorAll('[data-role-panel="' + role + '"]');
  for (const p of panels) {
    if (p.offsetParent !== null) return p;
  }
  return panels[0] || null;
}

function wireRoleTabs(root) {
  root.querySelectorAll('.role-tabs').forEach((group) => {
    const tabs = group.querySelectorAll('.role-tab');
    const panelContainer = group.parentElement;
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const role = tab.dataset.role;
        panelContainer.querySelectorAll('[data-role-panel]').forEach((p) => {
          p.style.display = p.dataset.rolePanel === role ? 'block' : 'none';
        });
      });
    });
  });
}

function setLoginRole(root, role) {
  root.querySelectorAll('[data-group="login-role"], [data-group="login-role-m"]').forEach((group) => {
    const tabs = group.querySelectorAll('.role-tab');
    const panelContainer = group.parentElement;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.role === role));
    panelContainer.querySelectorAll('[data-role-panel]').forEach((p) => {
      p.style.display = p.dataset.rolePanel === role ? 'block' : 'none';
    });
  });
}

function showSuccessBanner(role) {
  const roleLabel = role === 'driver' ? 'driver' : 'user';
  const html =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' +
    '<span>Account created. Sign in with your new ' + roleLabel + ' credentials to continue.</span>';
  ['banner-desktop', 'banner-mobile'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = html;
      el.style.display = 'flex';
    }
  });
}

export function hideSuccessBanner() {
  ['banner-desktop', 'banner-mobile'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function captureAccountDetails(role, profile) {
  try {
    localStorage.setItem('nerAccountProfile', JSON.stringify(profile));
  } catch (e) {
    /* ignore */
  }
  populateAccountProfile();
}

export function populateAccountProfile() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem('nerAccountProfile') || 'null');
  } catch (e) {
    /* ignore */
  }
  if (!data) return;
  const isDriver = !!data.isDriver;
  const name = data.username || (isDriver ? 'New Driver' : 'New User');
  const roleText = data.roleLabel || (isDriver ? 'Verified Driver · NER Logistics' : 'Field / Officer · NER Logistics');
  const initials = data.initials || (name.trim().charAt(0) || 'U').toUpperCase();
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || 'Not provided';
  };
  ['profileNameDesktop', 'profileNameMobile'].forEach((id) => set(id, name));
  ['profileRoleDesktop', 'profileRoleMobile'].forEach((id) => set(id, roleText));
  ['profileAvatarDesktop', 'profileAvatarMobile'].forEach((id) => set(id, initials));
  ['profileUsernameDesktop', 'profileUsernameMobile'].forEach((id) => set(id, data.username));
  ['profileMobileDesktop', 'profileMobileMobile'].forEach((id) => set(id, data.mobile));
  ['profileAadhaarDesktop', 'profileAadhaarMobile'].forEach((id) => set(id, data.aadhaar));
  ['profileLocationDesktop', 'profileLocationMobile'].forEach((id) => set(id, data.location));
  ['profileDlDesktop', 'profileDlMobile'].forEach((id) => set(id, data.dl));
  ['profileBaseDesktop', 'profileBaseMobile'].forEach((id) => set(id, data.location));
  ['profileVehicleDesktop', 'profileVehicleMobile'].forEach((id) =>
    set(id, data.vehiclePhotoUrl ? 'Uploaded and ready' : 'Not uploaded')
  );
  ['profileDriverCardDesktop', 'profileDriverCardMobile'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = isDriver ? 'block' : 'none';
  });
}

async function handleRegisterSubmit(role) {
  const panel = getVisiblePanel(role);
  if (!panel) return;

  const inputs = panel.querySelectorAll('input');
  const value = (i) => (inputs[i] ? inputs[i].value.trim() : '');
  const username = value(0) || (role === 'driver' ? 'New Driver' : 'New User');
  const dl = role === 'driver' ? value(1) : '';
  const aadhaar = role === 'driver' ? value(2) : value(1);
  const mobile = role === 'driver' ? value(3) : value(2);
  const location = role === 'driver' ? value(4) : value(3);
  const profession = role === 'user' ? panel.querySelector('select')?.value || '' : '';

  const passwordInput = panel.querySelector('input[type="password"], input.pw');
  const password = passwordInput ? passwordInput.value : '';
  if (!password || password.length < 6) {
    alert('Please choose a password with at least 6 characters.');
    return;
  }

  let photoFile = null;
  if (role === 'driver') {
    const fileInput = panel.querySelector('input[type="file"]');
    photoFile = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  }

  const submitBtn = panel.querySelector('.btn-primary');
  if (submitBtn) submitBtn.disabled = true;
  try {
    await authApi.register({ role, username, password, aadhaar, mobile, location, dl, profession }, photoFile);
    if (role === 'driver') publishVehicleProfile();
    setLoginRole(document, role);
    showSuccessBanner(role);
    goto('login');
  } catch (err) {
    alert(err.message || 'Registration failed. Please check the server is running and try again.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleLoginSubmit(buttonOrRole) {
  let role;
  let panel;
  if (typeof buttonOrRole === 'string') {
    role = buttonOrRole;
    panel = getVisiblePanel(role);
  } else {
    panel = buttonOrRole.closest('[data-role-panel]');
    role = panel ? panel.dataset.rolePanel : 'user';
  }
  if (!panel) return;

  const inputs = panel.querySelectorAll('input');
  const username = inputs[0] ? inputs[0].value.trim() : '';
  const passwordInput = panel.querySelector('input[type="password"], input.pw');
  const password = passwordInput ? passwordInput.value : '';

  if (!username || !password) {
    alert('Please enter your username and password.');
    return;
  }

  const submitBtn = typeof buttonOrRole === 'string' ? panel.querySelector('.btn-primary') : buttonOrRole;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const { token, profile } = await authApi.login({ role, username, password });
    setToken(token);
    captureAccountDetails(role, profile);
    ensureEventStream();
    goto('dashboard');
  } catch (err) {
    alert(err.message || 'Login failed. Please check your credentials and that the server is running.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ---------- OTP + password visibility ---------- */
function wireOtpBoxes(root) {
  const boxes = root.querySelectorAll('.otp-box');
  boxes.forEach((box, i, all) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (box.value && all[i + 1]) all[i + 1].focus();
    });
  });
}

function wireFieldEyes(root) {
  root.querySelectorAll('.field-eye').forEach((eye) => {
    eye.addEventListener('click', () => {
      const input = eye.parentElement.querySelector('input[type="password"], input[type="text"].pw');
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        input.classList.add('pw');
      } else {
        input.type = 'password';
      }
    });
  });
}

/* ---------- Incident photo + geotag ---------- */
let incidentPhotoData = null;
let incidentPhotoFile = null;
let incidentGeo = null;

function wireIncidentPhoto(inputId, previewId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.wired) return;
  input.dataset.wired = '1';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Please choose an incident photo smaller than 8 MB.');
      input.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Please choose a JPG or PNG image.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      incidentPhotoData = e.target.result;
      incidentPhotoFile = file;
      ['incidentPhotoPreviewDesktop', 'incidentPhotoPreviewMobile'].forEach((id) => {
        const preview = document.getElementById(id);
        if (preview) {
          const img = preview.querySelector('img');
          const nameEl = preview.querySelector('.preview-name');
          const geoEl = preview.querySelector('.preview-geo');
          if (img) img.src = incidentPhotoData;
          if (nameEl) nameEl.textContent = file.name;
          if (geoEl) geoEl.textContent = incidentGeo ? 'GPS coordinates attached to this incident photo.' : 'Ready to attach GPS location.';
          preview.classList.add('show');
        }
      });
    };
    reader.readAsDataURL(file);
  });
}

function geotagIncident(device) {
  const update = (text, success, coords) => {
    incidentGeo = { text, coords: coords || incidentGeo?.coords || null };
    ['Desktop', 'Mobile'].forEach((s) => {
      const status = document.getElementById('incidentGeoStatus' + s);
      if (status) status.textContent = text;
      const preview = document.getElementById('incidentPhotoPreview' + s);
      if (preview && incidentPhotoData) {
        const geoEl = preview.querySelector('.preview-geo');
        if (geoEl) geoEl.textContent = success ? 'GPS coordinates attached to this incident photo.' : text;
      }
    });
  };
  if (navigator.geolocation) {
    update('Getting current GPS coordinates...', false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lon = pos.coords.longitude.toFixed(5);
        update('Geotag ready · ' + lat + ', ' + lon, true, { lat: Number(lat), lng: Number(lon) });
      },
      () => {
        update('GPS permission unavailable · Sector 4 location can be used for this prototype.', false);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  } else {
    update('GPS not supported · Sector 4 location can be used for this prototype.', false);
  }
}

function detectLocation(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = 'Locating...';
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        input.value = lat + ', ' + lon;
      },
      () => {
        input.value = 'Sector 4, Field Unit (GPS unavailable)';
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  } else {
    input.value = 'Sector 4, Field Unit';
  }
}

/* ---------- Weather ---------- */
const weatherCodeMap = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Depositing rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Dense drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent rain showers', '⛈️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm with hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️'],
};
function weatherLabel(code) {
  return (weatherCodeMap[code] || ['Conditions unavailable', '🌡️'])[0];
}

function renderWeather(suffix, data, locLabel) {
  const cur = data.current;
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('weatherLoc' + suffix, locLabel);
  setText('weatherTemp' + suffix, Math.round(cur.temperature_2m) + '°C');
  setText('weatherDesc' + suffix, weatherLabel(cur.weather_code));
  setText('weatherWind' + suffix, Math.round(cur.wind_speed_10m) + ' km/h');
  setText('weatherHumidity' + suffix, Math.round(cur.relative_humidity_2m) + '%');
  setText('weatherFeels' + suffix, Math.round(cur.apparent_temperature) + '°C');
  const forecastEl = document.getElementById('weatherForecast' + suffix);
  if (forecastEl && data.daily) {
    const days = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'];
    forecastEl.innerHTML = data.daily.time
      .slice(0, 5)
      .map((d, i) => {
        return (
          '<div class="weather-day"><div class="d">' + days[i] + '</div><div style="font-size:20px;margin-top:4px;">' +
          (weatherCodeMap[data.daily.weather_code[i]] || ['', ''])[1] +
          '</div><div class="t">' + Math.round(data.daily.temperature_2m_max[i]) + '° / ' + Math.round(data.daily.temperature_2m_min[i]) + '°</div></div>'
        );
      })
      .join('');
  }
  const riskyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99, 45, 48];
  const advisoryBox = document.getElementById('weatherAdvisory' + suffix);
  const advisoryText = document.getElementById('weatherAdvisoryText' + suffix);
  if (advisoryBox && advisoryText) {
    if (riskyCodes.includes(cur.weather_code)) {
      advisoryText.textContent =
        'Current conditions (' + weatherLabel(cur.weather_code) + ') may affect road visibility and travel time. Velocity AI is factoring this into route and vehicle recommendations.';
      advisoryBox.style.display = 'flex';
    } else {
      advisoryBox.style.display = 'none';
    }
  }
}

export function fetchLiveWeather(suffix) {  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('weatherLoc' + suffix, 'Detecting your location...');
  const useCoords = (lat, lon, label) => {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto';
    fetch(url)
      .then((r) => r.json())
      .then((data) => renderWeather(suffix, data, label))
      .catch(() => setText('weatherDesc' + suffix, 'Live weather unavailable right now — check your connection.'));
  };
  // Some browsers/OSes can leave the geolocation callback pending
  // indefinitely (e.g. a stalled permission prompt or no location
  // service available) without ever firing success or error — this
  // watchdog guarantees the page still loads a result within 10s.
  let settled = false;
  const settleOnce = (fn) => {
    if (settled) return;
    settled = true;
    fn();
  };
  const fallbackTimer = setTimeout(() => {
    settleOnce(() => useCoords('27.48', '95.35', 'Sector 4, Field Unit (approx.)'));
  }, 10000);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(fallbackTimer);
        settleOnce(() => {
          const lat = pos.coords.latitude.toFixed(3);
          const lon = pos.coords.longitude.toFixed(3);
          useCoords(lat, lon, 'Your location · ' + lat + ', ' + lon);
        });
      },
      () => {
        clearTimeout(fallbackTimer);
        settleOnce(() => useCoords('27.48', '95.35', 'Sector 4, Field Unit (approx.)'));
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    clearTimeout(fallbackTimer);
    settleOnce(() => useCoords('27.48', '95.35', 'Sector 4, Field Unit (approx.)'));
  }
}

const NATURAL_EVENT_ICON = [
  [/wildfire/i, '🔥'],
  [/storm|cyclone|hurricane|typhoon/i, '🌀'],
  [/flood/i, '🌊'],
  [/volcano/i, '🌋'],
  [/drought/i, '☀️'],
  [/landslide/i, '⛰️'],
  [/ice|snow/i, '❄️'],
  [/dust|haze|smoke/i, '🌫️'],
];
function iconForCategories(categories) {
  const text = (categories || []).join(' ');
  for (const [re, icon] of NATURAL_EVENT_ICON) {
    if (re.test(text)) return icon;
  }
  return '⚠️';
}

async function loadDisasterFeed() {
  const listEl = document.getElementById('disasterFeedListDesktop');
  if (!listEl) return;
  try {
    const { naturalEvents, earthquakes } = await weatherApi.disasterFeed();
    const metaEl = document.getElementById('disasterFeedMeta');
    const items = [
      ...naturalEvents.map((e) => ({
        kind: 'event',
        title: e.title,
        sub: e.categories.join(', '),
        icon: iconForCategories(e.categories),
      })),
      ...earthquakes.map((q) => ({
        kind: 'quake',
        title: `M${q.magnitude?.toFixed(1) ?? '?'} earthquake`,
        sub: `${q.place} · ${timeAgo(q.time)}`,
        icon: '🌍',
      })),
    ];
    if (metaEl) metaEl.textContent = `${items.length} active`;
    if (!items.length) {
      listEl.innerHTML = '<div style="padding:14px 4px;color:var(--text-soft);font-size:13px;">No active natural events or significant earthquakes reported for the Northeast India region right now — that\'s a good sign.</div>';
      return;
    }
    const VISIBLE = 6;
    const visible = items.slice(0, VISIBLE);
    const rest = items.slice(VISIBLE);
    const rowHtml = (i) =>
      `<div class="alert-item"><div class="alert-top"><span class="alert-tag update">${i.kind === 'quake' ? 'SEISMIC' : 'NATURAL EVENT'}</span></div>` +
      `<div class="alert-title">${i.icon} ${escapeHtml(i.title)}</div><div class="alert-desc">${escapeHtml(i.sub)}</div></div>`;

    listEl.innerHTML = visible.map(rowHtml).join('');
    if (rest.length) {
      const moreWrap = document.createElement('div');
      moreWrap.id = 'disasterFeedMore';
      moreWrap.style.display = 'none';
      moreWrap.innerHTML = rest.map(rowHtml).join('');
      listEl.appendChild(moreWrap);

      const toggle = document.createElement('div');
      toggle.className = 'view-all';
      toggle.style.cssText = 'text-align:center;padding:10px 4px;cursor:pointer;';
      toggle.textContent = `Show ${rest.length} more`;
      toggle.addEventListener('click', () => {
        const expanded = moreWrap.style.display === 'block';
        moreWrap.style.display = expanded ? 'none' : 'block';
        toggle.textContent = expanded ? `Show ${rest.length} more` : 'Show less';
      });
      listEl.appendChild(toggle);
    }
  } catch (err) {
    listEl.innerHTML = `<div style="padding:14px 4px;color:var(--danger);font-size:13px;">Could not load regional advisories: ${escapeHtml(err.message)}</div>`;
  }
}

/* ---------- Velocity AI chatbot ---------- */
function velAppendMsg(containerId, text, who) {
  const body = document.getElementById(containerId);
  if (!body) return;
  const div = document.createElement('div');
  div.className = 'vel-msg ' + who;
  div.innerHTML = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}
function velShowTyping(containerId) {
  const body = document.getElementById(containerId);
  if (!body) return;
  const t = document.createElement('div');
  t.className = 'vel-typing';
  t.id = containerId + 'Typing';
  t.innerHTML = '<span></span><span></span><span></span>';
  body.appendChild(t);
  body.scrollTop = body.scrollHeight;
}
function velHideTyping(containerId) {
  const t = document.getElementById(containerId + 'Typing');
  if (t) t.remove();
}
async function velBotReply(userText, containerId) {
  let reply;
  try {
    const { reply: liveReply } = await velocityApi.chat(userText);
    reply = liveReply;
  } catch (err) {
    reply = velScriptedReply(userText);
  }
  velHideTyping(containerId);
  velAppendMsg(containerId, reply, 'bot');
}

// Deterministic fallback used when the backend/Velocity AI endpoint is
// unreachable (e.g. offline field use, or MongoDB/API not yet configured).
function velScriptedReply(userText) {
  const text = userText.toLowerCase();
  if (text.includes('2 vehicle') || text.includes('two vehicle') || text.includes('different direction')) {
    return "Got it — two vehicles, two directions. I compared both legs: <b>Order A</b> has an easy, low-risk road, while <b>Order B</b> runs through a longer, incident-prone stretch. I'm assigning the strongest available driver to Order B first so it isn't left running late, and a nearby driver will cover Order A right after.";
  }
  if (text.includes('confirm')) {
    return 'Booking confirmed ✅ Your driver is <b>Rajesh Kumar</b> (Tata 407 · AS 01 AB 4821). His contact number will be shared with you now that the trip is booked: <b>+91 98765 43210</b>.';
  }
  if (text.includes('safe') || text.includes('safety') || text.includes('risk')) {
    return 'Safety comes first. I cross-check every route against photos uploaded to Incident Reports and live Google Maps data, and I steer around any road flagged for landslides, flooding or blockages.';
  }
  if (text.includes('driver') || text.includes('vehicle')) {
    return "Based on your location, I'd recommend <b>Rajesh Kumar</b> driving a Tata 407 Cargo Truck — he's 0.8 km away, available now, and it's the best vehicle type for this load.";
  }
  if (text.includes('hi') || text.includes('hello') || text.includes('hey')) {
    return "Hey! Just tell me your pickup and drop location and I'll get you matched with the best driver.";
  }
  if (text.includes('to') || text.includes('→')) {
    return 'Searching nearby drivers and plotting the safest path with Google Maps...<br><br>Best match: <b>Rajesh Kumar</b> · Tata 407 Cargo Truck · 0.8 km away · <b>18 min ETA</b> on a 12.4 km route that avoids the Coastal Road B landslide reported this morning.<ul><li>Nearest available driver for this load right now</li><li>Lowest incident density on this corridor</li></ul>Want me to confirm this booking?';
  }
  return 'I can help you find the best driver and vehicle, plan routes around active incidents, or handle multiple orders heading in different directions. Try telling me a pickup and drop location, or tap one of the quick options below.';
}
function velSend(inputId, containerId) {
  const input = document.getElementById(inputId);
  if (!input || !input.value.trim()) return;
  const val = input.value.trim();
  velAppendMsg(containerId, val.replace(/</g, '&lt;'), 'user');
  input.value = '';
  velShowTyping(containerId);
  setTimeout(() => velBotReply(val, containerId), 400);
}
function velSendQuick(text, containerId) {
  velAppendMsg(containerId, text, 'user');
  velShowTyping(containerId);
  setTimeout(() => velBotReply(text, containerId), 400);
}

/* ---------- Vehicle photo (driver registration) ---------- */
let vehiclePhotoData = null;
function wireVehiclePhoto(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.wired) return;
  input.dataset.wired = '1';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Please choose a vehicle photo smaller than 5 MB.');
      input.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Please choose a JPG or PNG image.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      vehiclePhotoData = e.target.result;
      window.newVehiclePhotoReady = true;
      [document.getElementById('vehiclePreviewDesktop'), document.getElementById('vehiclePreviewMobile')].forEach((el) => {
        if (el) el.innerHTML = '<img src="' + vehiclePhotoData + '" alt="Vehicle preview">';
      });
      ['vehicleUploadSuccessDesktop', 'vehicleUploadSuccessMobile'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('show');
      });
    };
    reader.readAsDataURL(file);
  });
}
function setRegisterDriver() {
  document.querySelectorAll('[data-group="register-role"]').forEach((group) => {
    const tab = group.querySelector('[data-role="driver"]');
    if (tab) tab.click();
  });
}
function publishVehicleProfile() {
  if (!vehiclePhotoData) return;
  const card = document.getElementById('newDriverVehicleCard');
  const photo = document.getElementById('newDriverVehiclePhoto');
  if (card && photo) {
    photo.innerHTML = '<img src="' + vehiclePhotoData + '" alt="Registered driver vehicle">';
    card.style.display = 'block';
  }
}

/* ---------- Incident report submission ---------- */
function wireSeverityButtons(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.dataset.wired) return;
  container.dataset.wired = '1';
  const buttons = container.querySelectorAll('[data-value]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function getSelectedSeverity(containerId) {
  const container = document.getElementById(containerId);
  const active = container && container.querySelector('.active[data-value]');
  return active ? active.dataset.value : 'Medium';
}

async function submitIncidentReport(suffix) {
  const typeEl = document.getElementById('incidentType' + suffix);
  const descEl = document.getElementById('incidentDesc' + suffix);
  const msgEl = document.getElementById('incidentSubmitMsg' + suffix);
  const submitBtn = document.getElementById('incidentSubmit' + suffix);

  const type = typeEl ? typeEl.value : '';
  if (!type) {
    alert('Please select an incident type.');
    return;
  }

  const severity = getSelectedSeverity('incidentSeverity' + suffix);
  const description = descEl ? descEl.value.trim() : '';

  const showMsg = (text, isError) => {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = isError ? '#DC2626' : '#16A34A';
    msgEl.style.display = 'block';
  };

  if (submitBtn) submitBtn.disabled = true;
  try {
    const fields = {
      type,
      severity,
      description,
      locationLabel: incidentGeo?.text || '',
      lat: incidentGeo?.coords?.lat,
      lng: incidentGeo?.coords?.lng,
    };
    if (navigator.onLine === false) {
      throw Object.assign(new Error('offline'), { isOffline: true });
    }
    await incidentApi.create(fields, incidentPhotoFile);
    showMsg('Incident report submitted successfully.', false);
    if (descEl) descEl.value = '';
    incidentPhotoFile = null;
    incidentPhotoData = null;
  } catch (err) {
    const fields = {
      type,
      severity,
      description,
      locationLabel: incidentGeo?.text || '',
      lat: incidentGeo?.coords?.lat,
      lng: incidentGeo?.coords?.lng,
    };
    try {
      await queueOfflineIncident(fields, incidentPhotoFile);
      showMsg('You appear to be offline. This report was saved on your device and will sync automatically once you reconnect.', true);
      if (descEl) descEl.value = '';
      incidentPhotoFile = null;
      incidentPhotoData = null;
    } catch (queueErr) {
      showMsg(err.message || 'Could not submit right now, and could not save it locally either.', true);
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function wireIncidentSubmit(suffix) {
  const btn = document.getElementById('incidentSubmit' + suffix);
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => submitIncidentReport(suffix));
}

/* ---------- Live data rendering (Dashboard / Roads / Vehicles / Deliveries / Alerts / Reports) ---------- */
// Every function below is defensive: if the backend isn't reachable (no
// token yet, MongoDB not configured, server not running...) it simply
// leaves the original static mock markup in place instead of throwing.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('time_just_now');
  if (mins < 60) return t('time_minutes_ago').replace('{n}', mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('time_hours_ago').replace('{n}', hrs);
  return t('time_days_ago').replace('{n}', Math.floor(hrs / 24));
}

const ALERT_TAG_CLASS = { CRITICAL: 'critical', 'HIGH RISK': 'highrisk', UPDATE: '', LOGISTICS: '' };
const ALERT_TAG_CHIP = { CRITICAL: 'critical', 'HIGH RISK': 'highrisk', UPDATE: 'update', LOGISTICS: 'logistics' };
const ALERT_TAG_I18N_KEY = { CRITICAL: 'alert_tag_critical', 'HIGH RISK': 'alert_tag_highrisk', UPDATE: 'alert_tag_update', LOGISTICS: 'alert_tag_logistics' };

function renderAlertItemHtml(alert) {
  const itemClass = ALERT_TAG_CLASS[alert.tag] || '';
  const chipClass = ALERT_TAG_CHIP[alert.tag] || 'update';
  const tagLabel = ALERT_TAG_I18N_KEY[alert.tag] ? t(ALERT_TAG_I18N_KEY[alert.tag]) : alert.tag;
  const isUnread = alert.read === false;
  const clickable = alert.relatedIncident ? ' style="cursor:pointer;"' : '';
  return (
    `<div class="alert-item ${itemClass}${isUnread ? ' alert-unread' : ''}" data-alert-id="${escapeHtml(alert._id)}" ` +
    `data-incident-id="${escapeHtml(typeof alert.relatedIncident === 'object' ? alert.relatedIncident?._id : alert.relatedIncident || '')}"${clickable}>` +
    `<div class="alert-top">` +
    (isUnread ? '<span class="alert-unread-dot" title="Unread"></span>' : '') +
    `<span class="alert-tag ${chipClass}">${escapeHtml(tagLabel)}</span>` +
    `<span class="alert-time">${timeAgo(alert.createdAt)}</span></div>` +
    `<div class="alert-title">${escapeHtml(alert.title)}</div>` +
    `<div class="alert-desc">${escapeHtml(alert.description)}</div></div>`
  );
}

function wireAlertItemClicks(container) {
  if (!container || container.dataset.clickWired) return;
  container.dataset.clickWired = '1';
  container.addEventListener('click', async (e) => {
    const item = e.target.closest('.alert-item');
    if (!item) return;
    const alertId = item.dataset.alertId;
    const incidentId = item.dataset.incidentId;
    if (alertId && item.classList.contains('alert-unread')) {
      try {
        await alertApi.markRead(alertId);
        item.classList.remove('alert-unread');
        const dot = item.querySelector('.alert-unread-dot');
        if (dot) dot.remove();
        const cached = alertsAllCache.find((a) => a._id === alertId);
        if (cached) cached.read = true;
        updateUnreadBadge();
      } catch (err) {
        console.warn('Could not mark alert read:', err.message);
      }
    }
    if (incidentId) {
      openIncidentModal(incidentId);
    }
  });
}

async function updateUnreadBadge() {
  const badge = document.getElementById('alertsUnreadBadge');
  const dashBadge = document.getElementById('statAlertsMobile');
  try {
    const { unreadCount } = await alertApi.list(1);
    if (badge) badge.textContent = unreadCount > 0 ? t('alerts_unread_count').replace('{n}', unreadCount) : t('alerts_all_caught_up');
  } catch {
    /* ignore */
  }
}

function wireMarkAllRead(root) {
  const btn = document.getElementById('alertsMarkAllReadBtn');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const label = btn.querySelector('span');
    const originalKey = label?.getAttribute('data-i18n');
    try {
      await alertApi.markAllRead();
      document.querySelectorAll('.alert-item.alert-unread').forEach((el) => {
        el.classList.remove('alert-unread');
        el.querySelector('.alert-unread-dot')?.remove();
      });
      alertsAllCache.forEach((a) => (a.read = true));
      updateUnreadBadge();
      // Explicit success feedback: this button has nothing visible to do
      // once every alert is already read, which otherwise looks like the
      // click did nothing at all.
      if (label) {
        label.removeAttribute('data-i18n');
        label.textContent = `✓ ${t('common_done')}`;
        setTimeout(() => {
          if (originalKey) label.setAttribute('data-i18n', originalKey);
          label.textContent = t(originalKey || 'common_markAllRead');
        }, 1800);
      }
    } catch (err) {
      alert(err.message || 'Could not mark all as read.');
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- Incident detail modal (opened from an Alert click) ---------- */
function ensureModalRoot() {
  let modal = document.getElementById('nerModalRoot');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'nerModalRoot';
  modal.className = 'ner-modal-overlay';
  modal.innerHTML = '<div class="ner-modal" role="dialog" aria-modal="true"><button class="ner-modal-close" id="nerModalClose">&times;</button><div id="nerModalBody"></div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.querySelector('#nerModalClose').addEventListener('click', closeModal);
  return modal;
}
function closeModal() {
  const modal = document.getElementById('nerModalRoot');
  if (modal) modal.classList.remove('open');
}
async function openIncidentModal(incidentId) {
  const modal = ensureModalRoot();
  modal.querySelector('.ner-modal').classList.remove('ner-modal-wide');
  const body = modal.querySelector('#nerModalBody');
  body.innerHTML = '<div style="padding:30px;text-align:center;color:#6B7280;">Loading incident…</div>';
  modal.classList.add('open');
  try {
    const { incident } = await incidentApi.get(incidentId);
    const photoUrl = incident.photoUrl ? escapeHtml(fileUrl(incident.photoUrl)) : '';
    const photo = photoUrl
      ? `<a href="${photoUrl}" target="_blank" rel="noopener noreferrer" title="Open full size">` +
        `<img src="${photoUrl}" alt="Incident evidence" class="incident-evidence-img" ` +
        `style="width:100%;border-radius:10px;margin-top:10px;max-height:260px;object-fit:cover;cursor:zoom-in;" ` +
        `onerror="this.closest('a').outerHTML='<div class=&quot;field-hint&quot; style=&quot;margin-top:10px;color:var(--danger);&quot;>Photo evidence was attached but could not be loaded from the server.</div>'">` +
        `</a>`
      : '<div class="field-hint" style="margin-top:10px;">No photo was attached to this report.</div>';
    body.innerHTML =
      `<div class="ner-modal-title">${escapeHtml(incident.type)} · ${escapeHtml(incident.severity)}</div>` +
      `<div class="ner-modal-row"><b>Status:</b> ${escapeHtml(incident.status)}</div>` +
      `<div class="ner-modal-row"><b>Location:</b> ${escapeHtml(incident.locationLabel || 'Not provided')}</div>` +
      (incident.road ? `<div class="ner-modal-row"><b>Road:</b> ${escapeHtml(incident.road.name)} (${escapeHtml(incident.road.district)})</div>` : '') +
      `<div class="ner-modal-row"><b>Reported by:</b> ${escapeHtml(incident.reportedBy?.username || 'Unknown')}</div>` +
      `<div class="ner-modal-row"><b>Reported:</b> ${new Date(incident.createdAt).toLocaleString()}</div>` +
      `<div class="ner-modal-row" style="margin-top:8px;">${escapeHtml(incident.description || 'No further description provided.')}</div>` +
      photo;
  } catch (err) {
    body.innerHTML = `<div style="padding:20px;color:#DC2626;">Could not load incident: ${escapeHtml(err.message)}</div>`;
  }
}
window.__nerCloseModal = closeModal;

function currentGreetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return t('greeting_morning');
  if (hour < 17) return t('greeting_afternoon');
  return t('greeting_evening');
}

function currentDisplayName() {
  try {
    const data = JSON.parse(localStorage.getItem('nerAccountProfile') || 'null');
    return data?.username || null;
  } catch {
    return null;
  }
}

function renderDashboardGreeting() {
  const greeting = currentGreetingWord();
  const name = currentDisplayName();
  const now = new Date();
  const longDate = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const shortDate = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const titleEl = document.getElementById('dashboardGreetTitle');
  if (titleEl) titleEl.textContent = name ? `${greeting}, ${name}` : greeting;

  const titleMobileEl = document.getElementById('dashboardGreetTitleMobile');
  if (titleMobileEl) titleMobileEl.textContent = name ? `${greeting}, ${name}` : greeting;

  const dateEl = document.querySelector('#dashboardGreetDate span');
  if (dateEl) dateEl.textContent = longDate;

  const dateMobileEl = document.getElementById('dashboardGreetDateMobile');
  if (dateMobileEl) dateMobileEl.textContent = shortDate;
}

async function loadDashboardData(root) {
  renderDashboardGreeting();
  const hasStats = root.querySelector('#statVehiclesDesktop, #statVehiclesMobile');
  const hasAlerts = root.querySelector('#dashboardAlertsListDesktop');
  if (!hasStats && !hasAlerts) return;

  try {
    const [{ vehicles }, { deliveries, stats }, { roads }, { incidents }, { alerts }] = await Promise.all([
      vehicleApi.list(),
      deliveryApi.list('?limit=1'),
      roadApi.list('?limit=200'),
      incidentApi.list('?status=Open&limit=200'),
      alertApi.list(6),
    ]);

    const activeVehicles = vehicles.filter((v) => v.status === 'Active').length;
    const blockedRoads = roads.filter((r) => r.status === 'Blocked').length;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('statVehiclesDesktop', activeVehicles);
    setText('statVehiclesMobile', activeVehicles);
    setText('statDeliveriesDesktop', stats.active);
    setText('statDeliveriesMobile', stats.active);
    setText('statRoadsDesktop', blockedRoads);
    setText('statAlertsMobile', alerts.length);
    setText('statIncidentsDesktop', incidents.length);
    setText('statIncidentsMobile', incidents.length);

    const listEl = document.getElementById('dashboardAlertsListDesktop');
    if (listEl && alerts.length) {
      listEl.innerHTML = alerts.map(renderAlertItemHtml).join('');
      wireAlertItemClicks(listEl);
    }
  } catch (err) {
    // Backend not reachable yet — keep the static demo content visible.
    console.warn('Dashboard live data unavailable:', err.message);
  }
}

const ROAD_STATUS_CLASS = { Accessible: 'accessible', Risky: 'risky', Blocked: 'blocked' };
const PAGE_SIZE = 10;

function csvDownload(filename, rows) {
  if (!rows.length) {
    alert('Nothing to export for the current filters.');
    return;
  }
  const headers = Object.keys(rows[0]);
  const escapeCell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderPagination(container, page, totalPages, onPage) {
  if (!container) return;
  container.innerHTML = '';
  const mkArrow = (dir, disabled) => {
    const el = document.createElement('div');
    el.className = 'page-arrow' + (disabled ? ' disabled' : '');
    el.innerHTML =
      dir === 'prev'
        ? '<svg fill="none" stroke="currentColor" stroke-width="2.4" viewbox="0 0 24 24"><path d="M15 6l-6 6 6 6"></path></svg>'
        : '<svg fill="none" stroke="currentColor" stroke-width="2.4" viewbox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>';
    if (!disabled) el.addEventListener('click', () => onPage(dir === 'prev' ? page - 1 : page + 1));
    return el;
  };
  container.appendChild(mkArrow('prev', page <= 1));
  const pages = new Set([1, totalPages, page, page - 1, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) {
      const dots = document.createElement('div');
      dots.className = 'page-num';
      dots.style.cursor = 'default';
      dots.textContent = '…';
      container.appendChild(dots);
    }
    const el = document.createElement('div');
    el.className = 'page-num' + (p === page ? ' active' : '');
    el.textContent = String(p);
    el.addEventListener('click', () => onPage(p));
    container.appendChild(el);
    prev = p;
  }
  container.appendChild(mkArrow('next', page >= totalPages));
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- Roads: search + filters + pagination + export ---------- */
let roadsPageRefresh = null;
function wireRoadsPage(root) {
  const tbody = document.getElementById('roadsTableBody');
  if (!tbody || tbody.dataset.wired) return;
  tbody.dataset.wired = '1';

  const searchInput = document.getElementById('roadsSearchInput');
  const districtSelect = document.getElementById('roadsDistrictFilter');
  const statusSelect = document.getElementById('roadsStatusFilter');
  const clearBtn = document.getElementById('roadsClearFilters');
  const exportBtn = document.getElementById('roadsExportBtn');
  const pagination = document.getElementById('roadsPagination');
  const footLabel = document.getElementById('roadsTableFootLabel');

  const state = { search: '', district: '', status: '', page: 1, lastRows: [] };

  function syncClearVisibility() {
    if (clearBtn) clearBtn.style.display = state.search || state.district || state.status ? 'flex' : 'none';
  }

  async function fetchAndRender() {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-soft);">Loading roads…</td></tr>';
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.district) params.set('district', state.district);
    if (state.status) params.set('status', state.status);
    params.set('page', state.page);
    params.set('limit', PAGE_SIZE);
    try {
      const { roads, total } = await roadApi.list(`?${params.toString()}`);
      state.lastRows = roads;
      if (!roads.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-soft);">No roads match these filters.</td></tr>';
      } else {
        tbody.innerHTML = roads
          .map((r) => {
            const risk = r.riskReason ? `${r.riskLevel} - ${r.riskReason}` : r.riskLevel;
            return (
              `<tr><td class="road-name">${escapeHtml(r.name)}</td><td>${escapeHtml(r.district)}</td>` +
              `<td><span class="status-pill ${ROAD_STATUS_CLASS[r.status] || 'accessible'}">${escapeHtml(r.status)}</span></td>` +
              `<td>${escapeHtml(risk)}</td><td>${timeAgo(r.lastUpdatedAt)}</td></tr>`
            );
          })
          .join('');
      }
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const startIdx = total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
      const endIdx = Math.min(state.page * PAGE_SIZE, total);
      if (footLabel) footLabel.textContent = `Showing ${startIdx} to ${endIdx} of ${total} routes`;
      renderPagination(pagination, state.page, totalPages, (p) => {
        state.page = p;
        fetchAndRender();
      });
      syncClearVisibility();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--danger);">Could not load roads: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // Populate district dropdown dynamically from the backend.
  roadApi
    .districts()
    .then(({ districts }) => {
      if (!districtSelect) return;
      districts.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        districtSelect.appendChild(opt);
      });
    })
    .catch(() => {});

  const debouncedSearch = debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    fetchAndRender();
  }, 350);

  searchInput?.addEventListener('input', debouncedSearch);
  districtSelect?.addEventListener('change', () => {
    state.district = districtSelect.value;
    state.page = 1;
    fetchAndRender();
  });
  statusSelect?.addEventListener('change', () => {
    state.status = statusSelect.value;
    state.page = 1;
    fetchAndRender();
  });
  clearBtn?.addEventListener('click', () => {
    state.search = '';
    state.district = '';
    state.status = '';
    state.page = 1;
    if (searchInput) searchInput.value = '';
    if (districtSelect) districtSelect.value = '';
    if (statusSelect) statusSelect.value = '';
    fetchAndRender();
  });
  exportBtn?.addEventListener('click', () => {
    csvDownload(
      `roads-export-${new Date().toISOString().slice(0, 10)}.csv`,
      state.lastRows.map((r) => ({
        Name: r.name,
        District: r.district,
        Status: r.status,
        RiskLevel: r.riskLevel,
        RiskReason: r.riskReason || '',
        LastUpdated: r.lastUpdatedAt,
      }))
    );
  });

  roadsPageRefresh = fetchAndRender;
  fetchAndRender();
}

async function loadRoadsData(root) {
  const mobileList = document.getElementById('roadsListMobile');
  wireRoadsPage(root);
  if (!mobileList) return;
  try {
    const { roads, total } = await roadApi.list('?limit=8');
    const countEl = document.getElementById('roadsCountMobile');
    if (countEl) countEl.textContent = `${total} routes`;
    mobileList.innerHTML = roads
      .map((r) => {
        const isBlocked = r.status === 'Blocked';
        const style = isBlocked ? ' style="background:#FCE8E8;color:#DC2626;"' : '';
        return (
          `<div class="mobile-list-item"><div><div class="mobile-list-title">${escapeHtml(r.name)}</div>` +
          `<div class="mobile-list-sub">${escapeHtml(r.district)}${r.riskReason ? ' · ' + escapeHtml(r.riskReason) : ''}</div></div>` +
          `<span class="mobile-status"${style}>${escapeHtml(r.status)}</span></div>`
        );
      })
      .join('');
  } catch (err) {
    console.warn('Roads mobile data unavailable:', err.message);
  }
}

async function loadVehiclesData(root) {
  const grid = document.getElementById('vehicleGrid');
  const mobileList = document.getElementById('vehicleListMobile');
  if (!grid && !mobileList) return;

  try {
    const { vehicles } = await vehicleApi.list();
    if (!vehicles.length) return;

    if (grid) {
      grid.innerHTML = vehicles
        .map((v) => {
          const ownerName = v.owner?.username || 'Unassigned';
          const initial = (ownerName.trim().charAt(0) || 'D').toUpperCase();
          const photo = v.photoUrl
            ? `<img src="${escapeHtml(fileUrlLocal(v.photoUrl))}" alt="${escapeHtml(v.name)}" style="width:100%;height:100%;object-fit:cover;">`
            : `<svg fill="none" stroke="currentColor" stroke-width="1.5" viewbox="0 0 24 24"><rect height="9" rx="1.5" width="13" x="1" y="7"></rect><path d="M14 10h4l3 3v3h-7z"></path><circle cx="6" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle></svg>`;
          return (
            `<div class="vehicle-card"><div class="vehicle-card-photo">${photo}</div>` +
            `<div class="vehicle-card-body"><div class="vehicle-card-top"><div><div class="vehicle-name">${escapeHtml(v.name)}</div>` +
            `<div class="vehicle-number">${escapeHtml(v.number)}</div></div><span class="vehicle-status">${escapeHtml(v.status)}</span></div>` +
            `<div class="vehicle-meta"><div class="vehicle-meta-box"><div class="vehicle-meta-k">Type</div><div class="vehicle-meta-v">${escapeHtml(v.type)}</div></div>` +
            `<div class="vehicle-meta-box"><div class="vehicle-meta-k">Capacity</div><div class="vehicle-meta-v">${v.capacityTons} Ton</div></div></div>` +
            `<div class="vehicle-owner"><span class="vehicle-owner-avatar">${initial}</span> ${escapeHtml(ownerName)} · Verified Driver</div>` +
            `<button class="btn-outline vehicle-view-route-btn" style="width:100%;margin-top:12px;justify-content:center;" data-vehicle-id="${escapeHtml(v._id)}">` +
            `<svg width="15" height="15" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z"></path><path d="M9 3v16M15 5v16"></path></svg>View Route</button>` +
            `</div></div>`
          );
        })
        .join('');
      wireVehicleRouteButtons(grid);
    }
    if (mobileList) {
      mobileList.innerHTML = vehicles
        .map((v) => {
          const ownerName = v.owner?.username || 'Unassigned';
          return (
            `<div class="vehicle-mobile-card"><div class="vehicle-mobile-photo"><svg fill="none" stroke="currentColor" stroke-width="1.5" viewbox="0 0 24 24"><rect height="9" rx="1.5" width="13" x="1" y="7"></rect><path d="M14 10h4l3 3v3h-7z"></path><circle cx="6" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle></svg></div>` +
            `<div class="vehicle-mobile-info"><strong>${escapeHtml(v.name)} · ${escapeHtml(v.number)}</strong><p>Registered driver: ${escapeHtml(ownerName)}</p>` +
            `<div class="vehicle-meta-row"><span class="vehicle-chip">${escapeHtml(v.type)}</span><span class="vehicle-chip">${v.capacityTons} Ton</span><span class="vehicle-chip">${escapeHtml(v.status)}</span></div>` +
            `<button class="btn-outline vehicle-view-route-btn" style="width:100%;margin-top:10px;justify-content:center;" data-vehicle-id="${escapeHtml(v._id)}">View Route</button>` +
            `</div></div>`
          );
        })
        .join('');
      wireVehicleRouteButtons(mobileList);
    }
  } catch (err) {
    console.warn('Vehicles live data unavailable:', err.message);
  }

  loadDisruptionPanel();
}

/* ---------- AI Disruption Recovery Engine (Vehicles page) ---------- */
/* ---------- AI Disruption Recovery Engine (Vehicles page) ---------- */
function wireVehicleRouteButtons(container) {
  if (!container || container.dataset.routeWired) return;
  container.dataset.routeWired = '1';
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.vehicle-view-route-btn');
    if (!btn) return;
    openVehicleRouteModal(btn.dataset.vehicleId);
  });
}

let vehicleRouteMap = null;
let vehicleRouteLayers = [];

async function openVehicleRouteModal(vehicleId) {
  const modal = ensureModalRoot();
  modal.querySelector('.ner-modal').classList.add('ner-modal-wide');
  const body = modal.querySelector('#nerModalBody');
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#6B7280;">Loading vehicle route — checking active delivery and live road conditions…</div>';
  modal.classList.add('open');

  try {
    const data = await vehicleApi.route(vehicleId);

    if (!data.hasActiveDelivery) {
      body.innerHTML =
        '<div class="ner-modal-title">Vehicle Route</div>' +
        '<div style="padding:24px 0;text-align:center;color:var(--text-soft);font-size:13.5px;">' +
        '<svg width="34" height="34" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:10px;color:var(--text-faint);"><rect height="9" rx="1.5" width="13" x="1" y="7"></rect><path d="M14 10h4l3 3v3h-7z"></path><circle cx="6" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle></svg><br/>' +
        'This vehicle isn\'t currently assigned to an active delivery, so there\'s no route to show yet.</div>';
      return;
    }

    const { delivery, vehicle, currentRoute, alternate, disrupted, risk, providerNote } = data;

    const statusBanner = disrupted
      ? `<div class="disruption-banner" style="margin-bottom:16px;"><div class="disruption-banner-head">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"></path><path d="M12 8v5"></path><circle cx="12" cy="16" r=".6" fill="currentColor"></circle></svg>` +
        `Disruption on this route — ${escapeHtml(risk.level)} risk in ${escapeHtml(delivery.district)}${risk.reasons?.[0] ? ': ' + escapeHtml(risk.reasons[0]) : ''}</div></div>`
      : `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:12px 14px;margin-bottom:16px;color:#166534;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;">` +
        `<svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>Route clear — no elevated risk detected in ${escapeHtml(delivery.district)}.</div>`;

    const comparisonHtml = alternate
      ? `<div class="recovery-options-grid">` +
        `<div class="recovery-option-card"><div class="recovery-option-vehicle">${escapeHtml(vehicle.name)} (current)</div>` +
        `<div class="recovery-option-driver">${escapeHtml(vehicle.number)} · ${escapeHtml(vehicle.driverName)}</div>` +
        `<div class="recovery-option-row"><span class="k">Distance</span><span class="v">${currentRoute.distanceKm} km</span></div>` +
        `<div class="recovery-option-row"><span class="k">Est. Time</span><span class="v">${currentRoute.durationMinutes} min</span></div>` +
        `<div class="recovery-option-row"><span class="k">Route Risk</span><span class="v risk-${currentRoute.riskLevel}">${escapeHtml(currentRoute.riskLevel)}</span></div>` +
        `</div>` +
        `<div class="recovery-option-card recommended"><div class="recovery-option-badge"><svg width="11" height="11" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>ALTERNATE READY</div>` +
        `<div class="recovery-option-vehicle">${escapeHtml(alternate.vehicle.name)}</div>` +
        `<div class="recovery-option-driver">${escapeHtml(alternate.vehicle.number)} · ${escapeHtml(alternate.vehicle.driverName)}</div>` +
        `<div class="recovery-option-row"><span class="k">Distance</span><span class="v">${alternate.route.distanceKm} km</span></div>` +
        `<div class="recovery-option-row"><span class="k">Est. Time</span><span class="v">${alternate.route.durationMinutes} min</span></div>` +
        `<div class="recovery-option-row"><span class="k">Route Risk</span><span class="v risk-${alternate.route.riskLevel}">${escapeHtml(alternate.route.riskLevel)}</span></div>` +
        `<button class="btn-solid-sm" id="switchToAlternateBtn" style="width:100%;justify-content:center;margin-top:10px;">Switch Delivery to This Vehicle</button>` +
        `</div></div>` +
        (!alternate.isGenuinelyDifferentRoute
          ? '<p style="font-size:11px;color:var(--text-faint);margin-top:-6px;margin-bottom:14px;">The routing provider returned the same path for both — risk difference reflects moving off the currently-flagged vehicle, not a distinct road.</p>'
          : '')
      : '';

    body.innerHTML =
      `<div class="ner-modal-title">${escapeHtml(vehicle.name)} · ${escapeHtml(delivery.displayId)}</div>` +
      `<p style="font-size:12.5px;color:var(--text-soft);margin-bottom:14px;">${escapeHtml(delivery.originLabel)} → ${escapeHtml(delivery.destinationLabel)} · ${escapeHtml(delivery.district)} · Priority: ${escapeHtml(delivery.priority)}</p>` +
      statusBanner +
      `<div class="route-map" style="height:320px;margin-bottom:16px;"><div id="vehicleRouteMapEl" style="width:100%;height:100%;min-height:280px;border-radius:inherit;"></div></div>` +
      comparisonHtml +
      (providerNote ? `<p style="font-size:11px;color:var(--text-faint);">${escapeHtml(providerNote)}</p>` : '');

    if (currentRoute) {
      await renderVehicleRouteMap(currentRoute, alternate?.route);
    }

    document.getElementById('switchToAlternateBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Switching…';
      try {
        await deliveryApi.applyRecovery(delivery.id, {
          vehicleId: alternate.vehicle.id,
          distanceKm: alternate.route.distanceKm,
          durationMinutes: alternate.route.durationMinutes,
          routeRiskLevel: alternate.route.riskLevel,
        });
        btn.textContent = '✓ Switched';
        setTimeout(() => {
          closeModal();
          loadVehiclesData(document);
          loadDisruptionPanel();
          if (deliveriesPageRefresh) deliveriesPageRefresh();
        }, 700);
      } catch (err) {
        alert(err.message || 'Could not switch vehicles for this delivery.');
        btn.disabled = false;
        btn.textContent = 'Switch Delivery to This Vehicle';
      }
    });
  } catch (err) {
    body.innerHTML = `<div style="padding:24px;color:var(--danger);">Could not load this vehicle's route: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderVehicleRouteMap(currentRoute, altRoute) {
  const mapEl = document.getElementById('vehicleRouteMapEl');
  if (!mapEl) return;
  const L = await loadLeaflet();
  if (!L) return;

  if (vehicleRouteMap) {
    vehicleRouteMap.remove();
    vehicleRouteMap = null;
  }
  vehicleRouteMap = L.map(mapEl).setView([27.48, 95.35], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(vehicleRouteMap);

  vehicleRouteLayers = [];
  const bounds = [];

  const currentPoints = decodePolyline(currentRoute.polyline);
  if (currentPoints.length) {
    const color = currentRoute.riskLevel === 'High' ? '#EF4444' : currentRoute.riskLevel === 'Medium' ? '#F59E0B' : '#2563EB';
    const line = L.polyline(currentPoints, { color, weight: 5, opacity: 0.9, dashArray: currentRoute.riskLevel !== 'Low' ? '8 6' : undefined }).addTo(vehicleRouteMap);
    line.bindPopup(`Current route · ${currentRoute.distanceKm} km · ${currentRoute.durationMinutes} min · Risk: ${currentRoute.riskLevel}`);
    vehicleRouteLayers.push(line);
    currentPoints.forEach((p) => bounds.push(p));
  }

  if (altRoute) {
    const altPoints = decodePolyline(altRoute.polyline);
    if (altPoints.length) {
      const line = L.polyline(altPoints, { color: '#22C55E', weight: 5, opacity: 0.85 }).addTo(vehicleRouteMap);
      line.bindPopup(`Alternate route · ${altRoute.distanceKm} km · ${altRoute.durationMinutes} min · Risk: ${altRoute.riskLevel}`);
      vehicleRouteLayers.push(line);
      altPoints.forEach((p) => bounds.push(p));
    }
  }

  if (bounds.length) vehicleRouteMap.fitBounds(bounds, { padding: [30, 30] });
  setTimeout(() => vehicleRouteMap && vehicleRouteMap.invalidateSize(), 200);
}

async function loadDisruptionPanel() {
  const panel = document.getElementById('disruptionRecoveryPanel');
  if (!panel) return;
  try {
    const { disrupted } = await deliveryApi.disrupted();
    if (!disrupted.length) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }
    panel.style.display = 'block';
    panel.innerHTML =
      `<div class="disruption-banner"><div class="disruption-banner-head">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"></path><path d="M12 8v5"></path><circle cx="12" cy="16" r=".6" fill="currentColor"></circle></svg>` +
      `${disrupted.length} active ${disrupted.length === 1 ? 'delivery is' : 'deliveries are'} on a disrupted route</div>` +
      disrupted
        .map(
          ({ delivery: d, risk }) =>
            `<div class="disruption-item"><div class="disruption-item-info">` +
            `<div class="disruption-item-route">${escapeHtml(d.displayId)} · ${escapeHtml(d.originLabel)} → ${escapeHtml(d.destinationLabel)}` +
            `<span class="disruption-risk-chip ${risk.level}">${escapeHtml(risk.level)} RISK</span></div>` +
            `<div class="disruption-item-meta">${escapeHtml(d.district)} · ${escapeHtml(d.vehicle?.name || 'Unassigned')} (${escapeHtml(d.vehicle?.number || '—')}) · ${escapeHtml(risk.reasons[0] || 'Elevated regional risk')}</div>` +
            `</div><button class="btn-solid-sm" onclick="window.__nerOpenRecovery('${escapeHtml(d._id)}')">` +
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z"></path></svg>View Recovery Options</button></div>`
        )
        .join('');
  } catch (err) {
    console.warn('Disruption panel unavailable:', err.message);
  }
}

function scoreBarColor(score) {
  if (score >= 70) return 'var(--success)';
  if (score >= 45) return '#D97706';
  return 'var(--danger)';
}

async function openRecoveryModal(deliveryId) {
  const modal = ensureModalRoot();
  modal.querySelector('.ner-modal').classList.add('ner-modal-wide');
  const body = modal.querySelector('#nerModalBody');
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#6B7280;">Computing recovery options — checking available vehicles, live routing and regional risk…</div>';
  modal.classList.add('open');

  try {
    const data = await deliveryApi.recoveryOptions(deliveryId);
    if (!data.disrupted) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:#166534;">This delivery\'s district is no longer flagged as elevated risk — no recovery action needed.</div>';
      return;
    }
    if (!data.options.length) {
      body.innerHTML = `<div class="ner-modal-title">No Recovery Options Available</div><p style="font-size:13.5px;color:var(--text-soft);">${escapeHtml(data.message || 'No available vehicles right now.')}</p>`;
      return;
    }

    const flowSteps = ['Disruption Detected', 'Backup Vehicles Checked', 'Routes Scored', 'Best Option Ready'];
    const flowHtml = flowSteps
      .map((s, i) => `<div class="recovery-flow-step"><span class="num">${i + 1}</span>${escapeHtml(s)}</div>${i < flowSteps.length - 1 ? '<span class="recovery-flow-arrow">→</span>' : ''}`)
      .join('');

    const optionsHtml = data.options
      .map((o) => {
        return (
          `<div class="recovery-option-card${o.recommended ? ' recommended' : ''}" data-option='${JSON.stringify(o).replace(/'/g, '&#39;')}'>` +
          (o.recommended ? '<div class="recovery-option-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>RECOMMENDED</div>' : '') +
          `<div class="recovery-option-vehicle">${escapeHtml(o.vehicleName)} ${o.isCurrent ? '(current)' : ''}</div>` +
          `<div class="recovery-option-driver">${escapeHtml(o.vehicleNumber)} · ${escapeHtml(o.driverName)}</div>` +
          `<div class="recovery-option-row"><span class="k">Distance</span><span class="v">${o.distanceKm} km</span></div>` +
          `<div class="recovery-option-row"><span class="k">Est. Time</span><span class="v">${o.durationMinutes} min</span></div>` +
          `<div class="recovery-option-row"><span class="k">Est. Cost</span><span class="v">₹${o.estimatedCost.toLocaleString('en-IN')}</span></div>` +
          `<div class="recovery-option-row"><span class="k">Route Risk</span><span class="v risk-${o.routeRiskLevel}">${escapeHtml(o.routeRiskLevel)}</span></div>` +
          `<div class="recovery-option-row"><span class="k">Reliability</span><span class="v">${o.reliability}/100</span></div>` +
          `<div class="recovery-score-bar"><div class="recovery-score-bar-fill" style="width:${o.score}%;background:${scoreBarColor(o.score)};"></div></div>` +
          `<div class="recovery-score-label">Overall score: ${o.score}/100</div>` +
          `<button class="btn-solid-sm recovery-select-btn" style="width:100%;justify-content:center;">Select This Option</button>` +
          `</div>`
        );
      })
      .join('');

    const reasonsHtml = data.reasons?.length
      ? `<div class="recovery-reasons"><h4>Why the recommended option was chosen</h4><ul>${data.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul></div>`
      : '';

    const providerNoteHtml = data.providerNote
      ? `<p style="font-size:11.5px;color:var(--text-faint);margin-bottom:12px;">${escapeHtml(data.providerNote)}</p>`
      : '';

    body.innerHTML =
      `<div class="ner-modal-title">Recovery Options — ${escapeHtml(data.delivery.displayId)}</div>` +
      `<p style="font-size:12.5px;color:var(--text-soft);margin-bottom:14px;">${escapeHtml(data.delivery.originLabel)} → ${escapeHtml(data.delivery.destinationLabel)} · ${escapeHtml(data.delivery.district)} · Priority: ${escapeHtml(data.delivery.priority)}</p>` +
      `<div class="recovery-flow-strip">${flowHtml}</div>` +
      `<div class="recovery-options-grid">${optionsHtml}</div>` +
      reasonsHtml +
      providerNoteHtml;

    body.querySelectorAll('.recovery-option-card').forEach((card) => {
      const option = JSON.parse(card.dataset.option.replace(/&#39;/g, "'"));
      card.querySelector('.recovery-select-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Applying…';
        try {
          await deliveryApi.applyRecovery(deliveryId, {
            vehicleId: option.vehicleId,
            distanceKm: option.distanceKm,
            durationMinutes: option.durationMinutes,
            estimatedCost: option.estimatedCost,
            routeRiskLevel: option.routeRiskLevel,
          });
          btn.textContent = '✓ Applied';
          setTimeout(() => {
            closeModal();
            loadDisruptionPanel();
            if (deliveriesPageRefresh) deliveriesPageRefresh();
            loadVehiclesData(document);
          }, 700);
        } catch (err) {
          alert(err.message || 'Could not apply this recovery option.');
          btn.disabled = false;
          btn.textContent = 'Select This Option';
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div style="padding:24px;color:var(--danger);">Could not load recovery options: ${escapeHtml(err.message)}</div>`;
  }
}
window.__nerOpenRecovery = openRecoveryModal;

function fileUrlLocal(path) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  return path.startsWith('http') ? path : `${base}${path}`;
}

const DELIVERY_STATUS_CLASS = {
  Scheduled: 'scheduled', Assigned: 'assigned', 'In Progress': 'inprogress',
  Delayed: 'delayed', Completed: 'completed', Cancelled: 'cancelled',
};
const DELIVERY_STATUSES = ['Scheduled', 'Assigned', 'In Progress', 'Delayed', 'Completed', 'Cancelled'];

let deliveriesPageRefresh = null;
function wireDeliveriesPage(root) {
  const tbody = document.getElementById('deliveriesTableBody');
  if (!tbody || tbody.dataset.wired) return;
  tbody.dataset.wired = '1';

  const searchInput = document.getElementById('deliveriesSearchInput');
  const statusSelect = document.getElementById('deliveriesStatusFilter');
  const districtSelect = document.getElementById('deliveriesDistrictFilter');
  const clearBtn = document.getElementById('deliveriesClearFilters');
  const exportBtn = document.getElementById('deliveriesExportBtn');
  const newBtn = document.getElementById('deliveriesNewBtn');
  const pagination = document.getElementById('deliveriesPagination');
  const footLabel = document.getElementById('deliveriesTableFootLabel');

  const state = { search: '', status: '', district: '', page: 1, lastRows: [] };

  function syncClearVisibility() {
    if (clearBtn) clearBtn.style.display = state.search || state.status || state.district ? 'flex' : 'none';
  }

  async function fetchAndRender() {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-soft);">Loading deliveries…</td></tr>';
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.status) params.set('status', state.status);
    if (state.district) params.set('district', state.district);
    params.set('page', state.page);
    params.set('limit', PAGE_SIZE);
    try {
      const { deliveries, total, stats } = await deliveryApi.list(`?${params.toString()}`);
      state.lastRows = deliveries;

      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      if (stats) {
        setText('deliveriesStatActive', stats.active);
        setText('deliveriesStatCompleted', stats.deliveredToday ?? stats.completed ?? '—');
        setText('deliveriesStatScheduled', stats.scheduled);
      }

      if (!deliveries.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-soft);">No deliveries match these filters.</td></tr>';
      } else {
        tbody.innerHTML = deliveries
          .map((d) => {
            const driverName = d.driver?.username || '—';
            const pillClass = DELIVERY_STATUS_CLASS[d.status] || 'scheduled';
            const options = DELIVERY_STATUSES.map(
              (s) => `<option value="${s}" ${s === d.status ? 'selected' : ''}>${s}</option>`
            ).join('');
            return (
              `<tr><td class="road-name">${escapeHtml(d.displayId)}</td>` +
              `<td>${escapeHtml(d.originLabel)} → ${escapeHtml(d.destinationLabel)}</td>` +
              `<td>${escapeHtml(driverName)}</td>` +
              `<td><select class="status-select status-pill ${pillClass}" data-delivery-id="${escapeHtml(d._id)}">${options}</select></td>` +
              `<td>${escapeHtml(d.etaLabel || '—')}</td></tr>`
            );
          })
          .join('');
      }
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const startIdx = total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
      const endIdx = Math.min(state.page * PAGE_SIZE, total);
      if (footLabel) footLabel.textContent = `Showing ${startIdx} to ${endIdx} of ${total} deliveries`;
      renderPagination(pagination, state.page, totalPages, (p) => {
        state.page = p;
        fetchAndRender();
      });
      syncClearVisibility();

      tbody.querySelectorAll('.status-select').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const id = sel.dataset.deliveryId;
          const prev = sel.className;
          sel.disabled = true;
          try {
            await deliveryApi.updateStatus(id, { status: sel.value });
            sel.className = `status-select status-pill ${DELIVERY_STATUS_CLASS[sel.value] || 'scheduled'}`;
            fetchAndRender(); // refresh stats cards too
          } catch (err) {
            alert(err.message || 'Could not update delivery status.');
            sel.className = prev;
          } finally {
            sel.disabled = false;
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--danger);">Could not load deliveries: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  deliveryApi
    .districts()
    .then(({ districts }) => {
      if (!districtSelect) return;
      districts.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        districtSelect.appendChild(opt);
      });
    })
    .catch(() => {});

  const debouncedSearch = debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    fetchAndRender();
  }, 350);
  searchInput?.addEventListener('input', debouncedSearch);
  statusSelect?.addEventListener('change', () => {
    state.status = statusSelect.value;
    state.page = 1;
    fetchAndRender();
  });
  districtSelect?.addEventListener('change', () => {
    state.district = districtSelect.value;
    state.page = 1;
    fetchAndRender();
  });
  clearBtn?.addEventListener('click', () => {
    state.search = '';
    state.status = '';
    state.district = '';
    state.page = 1;
    if (searchInput) searchInput.value = '';
    if (statusSelect) statusSelect.value = '';
    if (districtSelect) districtSelect.value = '';
    fetchAndRender();
  });
  exportBtn?.addEventListener('click', () => {
    csvDownload(
      `deliveries-export-${new Date().toISOString().slice(0, 10)}.csv`,
      state.lastRows.map((d) => ({
        DeliveryId: d.displayId,
        Origin: d.originLabel,
        Destination: d.destinationLabel,
        Driver: d.driver?.username || '',
        Status: d.status,
        ETA: d.etaLabel || '',
        District: d.district || '',
      }))
    );
  });
  newBtn?.addEventListener('click', () => openNewDeliveryModal(fetchAndRender));

  deliveriesPageRefresh = fetchAndRender;
  fetchAndRender();
}

async function openNewDeliveryModal(onCreated) {
  const modal = ensureModalRoot();
  modal.querySelector('.ner-modal').classList.remove('ner-modal-wide');
  const body = modal.querySelector('#nerModalBody');
  body.innerHTML = '<div style="padding:30px;text-align:center;color:#6B7280;">Loading vehicles…</div>';
  modal.classList.add('open');

  let vehicles = [];
  try {
    const res = await vehicleApi.list();
    vehicles = res.vehicles || [];
  } catch {
    /* proceed with an empty list; the form still lets the user type free-text values */
  }

  const vehicleOptions = vehicles
    .map((v) => `<option value="${escapeHtml(v._id)}">${escapeHtml(v.name)} · ${escapeHtml(v.number)} (${escapeHtml(v.owner?.username || 'Unassigned')})</option>`)
    .join('');

  body.innerHTML =
    '<div class="ner-modal-title">New Delivery</div>' +
    '<div class="ner-form-row"><label>Origin</label><input id="ndOrigin" placeholder="e.g. Hub A, Sector 4"></div>' +
    '<div class="ner-form-row"><label>Destination</label><input id="ndDestination" placeholder="e.g. Sector 7 Distribution Point"></div>' +
    '<div class="ner-form-row"><label>District</label><input id="ndDistrict" placeholder="e.g. East District"></div>' +
    `<div class="ner-form-row"><label>Vehicle / Driver</label><select id="ndVehicle"><option value="">Unassigned for now</option>${vehicleOptions}</select></div>` +
    '<div class="ner-form-row"><label>ETA label</label><input id="ndEta" placeholder="e.g. 45 min"></div>' +
    '<div id="ndError" style="color:var(--danger);font-size:12.5px;display:none;"></div>' +
    '<div class="ner-form-actions"><button class="btn-outline" id="ndCancel">Cancel</button><button class="btn-solid-sm" id="ndSubmit">Create Delivery</button></div>';

  modal.querySelector('#ndCancel').addEventListener('click', closeModal);
  modal.querySelector('#ndSubmit').addEventListener('click', async () => {
    const origin = document.getElementById('ndOrigin').value.trim();
    const destination = document.getElementById('ndDestination').value.trim();
    const district = document.getElementById('ndDistrict').value.trim();
    const vehicleId = document.getElementById('ndVehicle').value;
    const etaLabel = document.getElementById('ndEta').value.trim();
    const errEl = document.getElementById('ndError');
    if (!origin || !destination || !district) {
      errEl.textContent = 'Origin, destination and district are required.';
      errEl.style.display = 'block';
      return;
    }
    const btn = document.getElementById('ndSubmit');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
      const chosenVehicle = vehicles.find((v) => v._id === vehicleId);
      await deliveryApi.create({
        originLabel: origin,
        destinationLabel: destination,
        district,
        vehicle: vehicleId || undefined,
        driver: chosenVehicle?.owner?._id || undefined,
        etaLabel: etaLabel || undefined,
      });
      closeModal();
      onCreated?.();
    } catch (err) {
      errEl.textContent = err.message || 'Could not create delivery.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Delivery';
    }
  });
}

async function loadDeliveriesData(root) {
  const mobileList = document.getElementById('deliveriesListMobile');
  wireDeliveriesPage(root);
  if (!mobileList) return;
  try {
    const { deliveries, total, stats } = await deliveryApi.list('?limit=8');
    const countEl = document.getElementById('deliveriesActiveCountMobile');
    if (countEl) countEl.textContent = `${stats?.active ?? total} active`;
    mobileList.innerHTML = deliveries
      .map(
        (d) =>
          `<div class="mobile-list-item"><div class="mobile-list-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24"><rect height="4" rx="1" width="18" x="3" y="4"></rect><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"></path></svg></div>` +
          `<div><div class="mobile-list-title">Delivery ${escapeHtml(d.displayId)}</div><div class="mobile-list-sub">${escapeHtml(d.originLabel)} → ${escapeHtml(d.destinationLabel)}</div></div>` +
          `<span class="mobile-status">${escapeHtml(d.status)}</span></div>`
      )
      .join('');
  } catch (err) {
    console.warn('Deliveries mobile data unavailable:', err.message);
  }
}

let alertsFilterState = { tag: '', unreadOnly: false };
let alertsAllCache = [];

function renderFilteredAlerts() {
  const listEl = document.getElementById('alertsListDesktop');
  if (!listEl) return;
  let items = alertsAllCache;
  if (alertsFilterState.tag) items = items.filter((a) => a.tag === alertsFilterState.tag);
  if (alertsFilterState.unreadOnly) items = items.filter((a) => a.read === false);
  listEl.innerHTML = items.length
    ? items.map(renderAlertItemHtml).join('')
    : '<div style="padding:16px 4px;color:var(--text-soft);font-size:13px;">No alerts match this filter.</div>';
  wireAlertItemClicks(listEl);
}

function wireAlertsFilter(root) {
  const btn = document.getElementById('alertsFilterBtn');
  const menu = document.getElementById('alertsFilterMenu');
  const label = document.getElementById('alertsFilterLabel');
  if (!btn || !menu || btn.dataset.wired) return;
  btn.dataset.wired = '1';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', () => menu.classList.remove('open'));

  menu.querySelectorAll('.alerts-filter-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.querySelectorAll('.alerts-filter-option').forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      const val = opt.dataset.filter;
      alertsFilterState = val === 'unread' ? { tag: '', unreadOnly: true } : { tag: val, unreadOnly: false };
      if (label) label.textContent = val ? `${t('common_filter_prefix')} ${opt.textContent.trim()}` : t('common_filterAll');
      menu.classList.remove('open');
      renderFilteredAlerts();
    });
  });
}

async function loadAlertsPageData(root) {
  const listEl = document.getElementById('alertsListDesktop');
  wireMarkAllRead(root);
  wireAlertsFilter(root);
  if (!listEl) return;
  wireAlertItemClicks(listEl);
  try {
    const { alerts, unreadCount } = await alertApi.list(50);
    alertsAllCache = alerts;
    renderFilteredAlerts();
    const badge = document.getElementById('alertsUnreadBadge');
    if (badge) badge.textContent = unreadCount > 0 ? t('alerts_unread_count').replace('{n}', unreadCount) : t('alerts_all_caught_up');
  } catch (err) {
    console.warn('Alerts live data unavailable:', err.message);
  }
}

const REPORT_TAG_CHIP = { DAILY: 'logistics', FIELD: 'update', WEEKLY: 'logistics', MONTHLY: 'update' };

async function loadReportsData(root) {
  const listEl = document.getElementById('reportsListDesktop');
  const genBtn = document.getElementById('generateReportBtn');
  const exportAllBtn = document.getElementById('reportsExportAllBtn');
  let lastReports = [];

  if (genBtn && !genBtn.dataset.wired) {
    genBtn.dataset.wired = '1';
    genBtn.addEventListener('click', async () => {
      genBtn.textContent = 'Generating…';
      try {
        await reportApi.generate({ cadence: 'DAILY' });
        await loadReportsData(root);
      } catch (err) {
        alert(err.message || 'Could not generate report.');
      } finally {
        genBtn.textContent = '+ Generate Report';
      }
    });
  }

  if (exportAllBtn && !exportAllBtn.dataset.wired) {
    exportAllBtn.dataset.wired = '1';
    exportAllBtn.addEventListener('click', () => {
      csvDownload(
        `reports-export-${new Date().toISOString().slice(0, 10)}.csv`,
        lastReports.map((r) => ({
          Title: r.title,
          Cadence: r.cadence,
          Status: r.status,
          Description: r.description,
          GeneratedAt: r.generatedAt || '',
        }))
      );
    });
  }

  if (!listEl) return;
  try {
    const { reports } = await reportApi.list();
    lastReports = reports;
    if (!reports.length) {
      listEl.innerHTML = '<div style="padding:16px 4px;color:var(--text-soft);font-size:13px;">No reports yet. Click "Generate Report" to build one from live data.</div>';
      return;
    }
    listEl.innerHTML = reports
      .map(
        (r) =>
          `<div class="alert-item" data-report-id="${escapeHtml(r._id)}"><div class="alert-top"><span class="alert-tag ${REPORT_TAG_CHIP[r.cadence] || 'update'}">${escapeHtml(r.cadence)}</span>` +
          `<span class="alert-time">${r.status === 'Ready' ? 'Ready' : 'Generating…'}</span>` +
          `<span class="report-download" title="Download this report" data-report-id="${escapeHtml(r._id)}" style="margin-left:auto;cursor:pointer;color:var(--primary);"><svg width="15" height="15" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3v12M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg></span>` +
          `</div><div class="alert-title">${escapeHtml(r.title)}</div><div class="alert-desc">${escapeHtml(r.description)}</div></div>`
      )
      .join('');

    listEl.querySelectorAll('.report-download').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const report = lastReports.find((r) => r._id === btn.dataset.reportId);
        if (!report) return;
        csvDownload(`${report.title.replace(/\s+/g, '-').toLowerCase()}.csv`, [
          { Title: report.title, Cadence: report.cadence, Status: report.status, Description: report.description, GeneratedAt: report.generatedAt || '' },
        ]);
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div style="padding:16px 4px;color:var(--danger);font-size:13px;">Could not load reports: ${escapeHtml(err.message)}</div>`;
    console.warn('Reports live data unavailable:', err.message);
  }
}

/* ---------- Real map (Leaflet + OpenStreetMap — free, no API key) ---------- */
let leafletLoadingPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadingPromise) return leafletLoadingPromise;
  leafletLoadingPromise = new Promise((resolve, reject) => {
    const cssHref = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssHref;
      document.head.appendChild(link);
    }
    const scriptSrc = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    const existing = document.querySelector(`script[src="${scriptSrc}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      return;
    }
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Could not load the map library.'));
    document.head.appendChild(script);
  });
  return leafletLoadingPromise;
}

// Decodes the Google/ORS "encoded polyline" format into [lat, lng] pairs —
// both providers use the same well-known algorithm, so this works for either.
function decodePolyline(encoded) {
  if (!encoded) return [];
  let index = 0, lat = 0, lng = 0;
  const coordinates = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
}

/* ---------- Live Operations Map (Dashboard) ---------- */
let liveMapInstance = null;
let liveMapLayers = null; // { vehicles: L.LayerGroup, incidents: L.LayerGroup, roads: L.LayerGroup }

const ROAD_LINE_COLOR = { Accessible: '#22C55E', Risky: '#F59E0B', Blocked: '#EF4444' };

async function initLiveMap(root) {
  const container = document.getElementById('liveMapDesktop');
  if (!container) return; // not on this page
  if (container.dataset.wired) {
    // Already initialized for this mount — just refresh the data on it.
    refreshLiveMapData();
    return;
  }
  container.dataset.wired = '1';

  const loadingEl = document.getElementById('liveMapLoading');
  try {
    const L = await loadLeaflet();
    if (!L) throw new Error('Map library failed to load');

    const map = L.map(container, { zoomControl: false, attributionControl: true }).setView([26.2, 92.9], 7); // Northeast India
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    liveMapInstance = map;
    liveMapLayers = {
      vehicles: L.layerGroup().addTo(map),
      incidents: L.layerGroup().addTo(map),
      roads: L.layerGroup().addTo(map),
    };

    // Controls (wired to the custom buttons drawn in the fragment, matching
    // the existing design language instead of Leaflet's default chrome).
    document.getElementById('liveMapZoomIn')?.addEventListener('click', () => map.zoomIn());
    document.getElementById('liveMapZoomOut')?.addEventListener('click', () => map.zoomOut());
    document.getElementById('liveMapFullscreen')?.addEventListener('click', () => {
      const wrap = document.getElementById('liveMapWrap');
      wrap?.classList.toggle('is-fullscreen');
      setTimeout(() => map.invalidateSize(), 150);
    });
    document.getElementById('liveMapLocate')?.addEventListener('click', () => {
      if (!navigator.geolocation) return alert('Geolocation is not available in this browser.');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 12);
          L.marker([latitude, longitude], { title: 'You are here' }).addTo(map).bindPopup('You are here').openPopup();
        },
        () => alert('Could not get your location — check browser permissions.')
      );
    });
    const layerToggle = (checkboxId, layerKey) => {
      const cb = document.getElementById(checkboxId);
      cb?.addEventListener('change', () => {
        if (cb.checked) map.addLayer(liveMapLayers[layerKey]);
        else map.removeLayer(liveMapLayers[layerKey]);
      });
    };
    layerToggle('liveMapLayerVehicles', 'vehicles');
    layerToggle('liveMapLayerIncidents', 'incidents');
    layerToggle('liveMapLayerRoads', 'roads');

    if (loadingEl) loadingEl.classList.add('hide');
    await refreshLiveMapData();
  } catch (err) {
    if (loadingEl) {
      loadingEl.textContent = 'Live map unavailable: ' + err.message;
      loadingEl.classList.remove('hide');
    }
    console.warn('Live map init failed:', err.message);
  }
}

async function refreshLiveMapData() {
  if (!liveMapInstance || !liveMapLayers) return;
  const L = window.L;
  const { vehicles: vLayer, incidents: iLayer, roads: rLayer } = liveMapLayers;
  vLayer.clearLayers();
  iLayer.clearLayers();
  rLayer.clearLayers();

  try {
    const [{ vehicles }, { incidents }, { roads }] = await Promise.all([
      vehicleApi.list().catch(() => ({ vehicles: [] })),
      incidentApi.list('?status=Open&limit=50').catch(() => ({ incidents: [] })),
      roadApi.list('?limit=200').catch(() => ({ roads: [] })),
    ]);

    vehicles
      .filter((v) => v.currentLocation && v.currentLocation.lat != null)
      .forEach((v) => {
        const icon = L.divIcon({ className: 'map-marker-vehicle', iconSize: [16, 16] });
        const marker = L.marker([v.currentLocation.lat, v.currentLocation.lng], { icon });
        marker.bindPopup(
          `<div class="map-popup-title">${escapeHtml(v.name)}</div>` +
          `<div class="map-popup-row">${escapeHtml(v.number)} · ${escapeHtml(v.type)}</div>` +
          `<div class="map-popup-row">Driver: ${escapeHtml(v.owner?.username || 'Unassigned')}</div>` +
          `<div class="map-popup-row">Status: ${escapeHtml(v.status)}</div>`
        );
        vLayer.addLayer(marker);
      });

    incidents
      .filter((i) => i.coordinates && i.coordinates.lat != null)
      .forEach((i) => {
        const icon = L.divIcon({ className: 'map-marker-incident', iconSize: [16, 14] });
        const marker = L.marker([i.coordinates.lat, i.coordinates.lng], { icon });
        marker.bindPopup(
          `<div class="map-popup-title">${escapeHtml(i.type)} · ${escapeHtml(i.severity)}</div>` +
          `<div class="map-popup-row">${escapeHtml(i.locationLabel || '')}</div>` +
          `<div class="map-popup-row">${escapeHtml((i.description || '').slice(0, 120))}</div>` +
          `<a href="#" class="map-popup-link" data-incident-id="${escapeHtml(i._id)}" style="font-size:12px;font-weight:700;color:#2563EB;">View details →</a>`
        );
        marker.on('popupopen', () => {
          const link = document.querySelector(`.map-popup-link[data-incident-id="${i._id}"]`);
          link?.addEventListener('click', (e) => {
            e.preventDefault();
            openIncidentModal(i._id);
          });
        });
        iLayer.addLayer(marker);
      });

    roads
      .filter((r) => r.coordinates?.start?.lat != null && r.coordinates?.end?.lat != null)
      .forEach((r) => {
        const line = L.polyline(
          [
            [r.coordinates.start.lat, r.coordinates.start.lng],
            [r.coordinates.end.lat, r.coordinates.end.lng],
          ],
          {
            color: ROAD_LINE_COLOR[r.status] || '#94A3B8',
            weight: r.status === 'Blocked' ? 5 : 3,
            dashArray: r.status === 'Blocked' ? '8 6' : undefined,
            opacity: 0.85,
          }
        );
        line.bindPopup(
          `<div class="map-popup-title">${escapeHtml(r.name)}</div>` +
          `<div class="map-popup-row">${escapeHtml(r.district)} · ${escapeHtml(r.status)}</div>` +
          (r.riskReason ? `<div class="map-popup-row">${escapeHtml(r.riskReason)}</div>` : '')
        );
        rLayer.addLayer(line);
      });
  } catch (err) {
    console.warn('Live map data refresh failed:', err.message);
  }
}

/* ---------- Route Optimization page ---------- */
const routeOptMaps = {}; // keyed by suffix ('Desktop' | 'Mobile') — each needs its own
const routeOptLayersBySuffix = {}; // Leaflet instance since both containers exist in the DOM at once.

function renderRouteCardHtml(option, origin, destination) {
  const chipClass = option.riskLevel === 'High' ? 'high' : option.riskLevel === 'Medium' ? 'neutral' : 'low';
  const tag = option.recommended
    ? '<div class="route-tag"><svg fill="none" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"></path><path d="M9 12l2 2 4-4"></path></svg>RECOMMENDED</div>'
    : '';
  const btn = option.recommended
    ? `<button class="begin-btn" data-origin="${escapeHtml(origin)}" data-destination="${escapeHtml(destination)}"><svg fill="none" stroke="currentColor" stroke-width="2.4" viewbox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8-8-2z"></path></svg><span>Begin Navigation</span></button>`
    : '';
  return (
    `<div class="route-card${option.recommended ? ' recommended' : ''}">` +
    tag +
    `<div class="route-top"><div class="route-name">${escapeHtml(option.label)}</div>` +
    `<div class="route-eta"><div class="dur">${Math.floor(option.durationMinutes / 60)}h ${option.durationMinutes % 60}m</div>` +
    `<div class="eta">${escapeHtml(option.durationText || '')}</div></div></div>` +
    `<div class="route-meta"><div class="meta-chip neutral"><div class="k">Distance</div><div class="v">${option.distanceKm} km</div></div>` +
    `<div class="meta-chip ${chipClass}"><div class="k">Risk Level</div><div class="v">${escapeHtml(option.riskLevel)} <svg fill="currentColor" viewbox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle></svg></div></div></div>` +
    btn +
    `</div>`
  );
}

// Delegated so it keeps working every time resultsEl's innerHTML is replaced
// by a new route calculation, without re-binding duplicate listeners.
function wireBeginNavigation(resultsEl) {
  if (!resultsEl || resultsEl.dataset.navWired) return;
  resultsEl.dataset.navWired = '1';
  resultsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.begin-btn');
    if (!btn) return;
    const origin = btn.dataset.origin;
    const destination = btn.dataset.destination;
    const label = btn.querySelector('span');
    const originalText = label ? label.textContent : '';

    // Real, useful action: launch turn-by-turn navigation in Google Maps
    // with the actual origin/destination the user entered, and — where a
    // matching Vehicle/driver exists — mark a delivery as In Progress so
    // the rest of the app (Dashboard, Deliveries) reflects that this route
    // is now underway.
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');

    btn.disabled = true;
    if (label) label.textContent = 'Opened in Google Maps ✓';
    try {
      await deliveryApi.create({
        originLabel: origin,
        destinationLabel: destination,
        district: 'Unassigned',
        status: 'In Progress',
      });
      if (deliveriesPageRefresh) deliveriesPageRefresh();
      loadDashboardData(document).catch(() => {});
    } catch (err) {
      console.warn('Could not log this navigation as a delivery:', err.message);
    }
    setTimeout(() => {
      btn.disabled = false;
      if (label) label.textContent = originalText || 'Begin Navigation';
    }, 3000);
  });
}

async function calculateRoute(suffix) {
  const originInput = document.getElementById('routeOrigin' + suffix);
  const destInput = document.getElementById('routeDest' + suffix);
  const errorEl = document.getElementById('routeError' + suffix);
  const resultsEl = document.getElementById('routeResults' + suffix);
  const mapEl = document.getElementById('routeMap' + suffix);
  const btn = document.getElementById('routeCalcBtn' + suffix);

  if (!originInput || !destInput) return;
  const origin = originInput.value.trim();
  const destination = destInput.value.trim();
  if (errorEl) errorEl.style.display = 'none';
  if (!origin || !destination) {
    if (errorEl) {
      errorEl.textContent = 'Please enter both an origin and a destination.';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Calculating...';
  }

  try {
    const { routeOptimization } = await routeApi.optimize({ origin, destination });
    const options = routeOptimization.options || [];

    if (resultsEl) {
      resultsEl.innerHTML = options.map((opt) => renderRouteCardHtml(opt, origin, destination)).join('');
      wireBeginNavigation(resultsEl);
    }

    if (mapEl) {
      const L = await loadLeaflet();
      if (!routeOptMaps[suffix]) {
        routeOptMaps[suffix] = L.map(mapEl).setView([27.48, 95.35], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(routeOptMaps[suffix]);
      }
      const map = routeOptMaps[suffix];
      const layers = routeOptLayersBySuffix[suffix] || [];
      layers.forEach((l) => map.removeLayer(l));
      const newLayers = [];

      const bounds = [];
      const colors = ['#2563EB', '#94A3B8', '#F59E0B'];
      options.forEach((opt, i) => {
        const points = decodePolyline(opt.polyline);
        if (!points.length) return;
        const line = L.polyline(points, { color: colors[i] || '#94A3B8', weight: opt.recommended ? 6 : 4, opacity: opt.recommended ? 0.95 : 0.6 }).addTo(map);
        newLayers.push(line);
        points.forEach((p) => bounds.push(p));
      });
      if (bounds.length) {
        const originMarker = L.marker(bounds[0]).addTo(map).bindPopup(`Origin: ${escapeHtml(origin)}`);
        const destMarker = L.marker(bounds[bounds.length - 1]).addTo(map).bindPopup(`Destination: ${escapeHtml(destination)}`);
        newLayers.push(originMarker, destMarker);
        map.fitBounds(bounds, { padding: [30, 30] });
      }
      routeOptLayersBySuffix[suffix] = newLayers;
      setTimeout(() => map.invalidateSize(), 200);
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Could not calculate a route right now.';
      errorEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Calculate Route';
    }
  }
}

function wireRouteOptimizationPage(root) {
  // Both the desktop and mobile fragments exist in the DOM at once (CSS just
  // hides one), so auto-running on both would double up on real ORS
  // geocoding/routing API calls for a result the user can't even see yet.
  // Only auto-calculate for whichever layout is actually visible right now;
  // the other one still works on click, and lazily initializes its own map
  // the first time that happens.
  const isMobileViewport = window.matchMedia('(max-width: 900px)').matches;

  const btn = document.getElementById('routeCalcBtnDesktop');
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => calculateRoute('Desktop'));
    if (!isMobileViewport) calculateRoute('Desktop');
  }

  const btnMobile = document.getElementById('routeCalcBtnMobile');
  if (btnMobile && !btnMobile.dataset.wired) {
    btnMobile.dataset.wired = '1';
    btnMobile.addEventListener('click', () => calculateRoute('Mobile'));
    if (isMobileViewport) calculateRoute('Mobile');
  }
}

/* ---------- Sync page ---------- */
function applySyncUi(suffix, { pendingReports, pendingPhotos, lastSyncedAt }) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('syncPendingReports' + suffix, pendingReports);
  setText('syncPendingPhotos' + suffix, pendingPhotos);
  setText('syncRowReports' + suffix, pendingReports);
  setText('syncRowPhotos' + suffix, pendingPhotos);
  const lastSyncedLabel = lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never';
  setText('syncLastSynced' + suffix, lastSyncedLabel);

  const totalPending = (pendingReports || 0) + (pendingPhotos || 0);
  const isOnline = navigator.onLine !== false;
  setText('syncStatusText' + suffix, totalPending === 0 ? 'Status: Up to date' : isOnline ? 'Status: Online' : 'Status: Offline');
  setText(
    'syncStatusDesc' + suffix,
    totalPending === 0
      ? 'All field reports and photos have been synchronized.'
      : isOnline
      ? `${totalPending} item(s) are ready to sync.`
      : 'Data is being saved locally until the connection is restored.'
  );
  const badge = document.getElementById('syncStatusBadge' + suffix);
  if (badge) badge.textContent = totalPending === 0 ? 'UP TO DATE' : 'SYNC READY';
}

async function loadSyncPageData(root) {
  const hasSyncUi = document.getElementById('syncPendingReportsDesktop') || document.getElementById('syncPendingReportsMobile');
  if (!hasSyncUi) return;
  try {
    const status = await syncApi.status();
    const local = await offlineQueueCounts();
    const merged = {
      pendingReports: (status.pendingReports || 0) + local.pendingReports,
      pendingPhotos: (status.pendingPhotos || 0) + local.pendingPhotos,
      lastSyncedAt: status.lastSyncedAt,
    };
    applySyncUi('Desktop', merged);
    applySyncUi('Mobile', merged);
  } catch (err) {
    // Backend unreachable — still show the local offline queue so pending
    // field reports aren't invisible while offline.
    const local = await offlineQueueCounts();
    applySyncUi('Desktop', { ...local, lastSyncedAt: null });
    applySyncUi('Mobile', { ...local, lastSyncedAt: null });
    console.warn('Sync status unavailable:', err.message);
  }
}

// Tries to push everything in the local offline queue to the real API, then
// (if that worked and we're online) also flushes the backend's own pending
// SyncItem queue. Runs automatically when the browser comes back online,
// and manually via the "Sync Now" button.
async function runFullSync(root) {
  const { synced, failed } = await flushOfflineQueue((fields, photoFile) => incidentApi.create(fields, photoFile));
  try {
    await syncApi.run();
  } catch {
    /* backend sync endpoint unreachable — local queue flush above still counts */
  }
  await loadSyncPageData(root);
  return { synced, failed };
}

let onlineListenersInstalled = false;
function installConnectivityListeners(root) {
  if (onlineListenersInstalled) return;
  onlineListenersInstalled = true;
  window.addEventListener('online', () => {
    runFullSync(document).catch(() => {});
  });
  window.addEventListener('ner:offline-queue-changed', () => {
    loadSyncPageData(document).catch(() => {});
  });
  // Also catch the case where the app is opened (or refreshed) while the
  // device is already back online and photos/reports are still sitting in
  // the IndexedDB queue from a previous offline session — don't wait for a
  // fresh 'online' transition event to upload them.
  if (navigator.onLine !== false) {
    offlineQueueCounts()
      .then(({ pendingReports }) => {
        if (pendingReports > 0) return runFullSync(document);
      })
      .catch(() => {});
  }
}

/* ---------- Realtime updates (Server-Sent Events) ---------- */
// Opens exactly one SSE connection per page load (survives client-side route
// changes since App.jsx never unmounts). Handlers only touch elements that
// currently exist in the DOM, so this is safe to receive events for pages
// that aren't presently on screen — they simply no-op.
let eventSourceInstance = null;
function ensureEventStream() {
  if (eventSourceInstance) return;
  const es = openEventStream();
  if (!es) return; // not logged in yet — installGlobalBindings re-runs after login via App.jsx
  eventSourceInstance = es;

  es.addEventListener('alert:new', (e) => {
    try {
      const { alert } = JSON.parse(e.data);
      const dashList = document.getElementById('dashboardAlertsListDesktop');
      if (dashList) {
        dashList.insertAdjacentHTML('afterbegin', renderAlertItemHtml(alert));
        wireAlertItemClicks(dashList);
        if (dashList.children.length > 6) dashList.lastElementChild?.remove();
      }
      if (document.getElementById('alertsListDesktop')) {
        alertsAllCache.unshift(alert);
        renderFilteredAlerts();
      }
      updateUnreadBadge();
      loadDashboardData(document).catch(() => {});
    } catch (err) {
      console.warn('Could not process live alert:', err.message);
    }
  });

  es.addEventListener('incident:new', () => {
    refreshLiveMapData();
    loadDashboardData(document).catch(() => {});
  });

  es.addEventListener('road:updated', () => {
    refreshLiveMapData();
    if (roadsPageRefresh) roadsPageRefresh();
    loadDashboardData(document).catch(() => {});
    loadDisruptionPanel();
  });

  es.addEventListener('delivery:updated', () => {
    if (deliveriesPageRefresh) deliveriesPageRefresh();
    loadDisruptionPanel();
  });

  es.onerror = () => {
    // EventSource auto-reconnects on its own; nothing else to do here.
  };
}

function wireSyncButtons(root) {
  ['Desktop', 'Mobile'].forEach((suffix) => {
    const btn = document.getElementById('syncNowBtn' + suffix);
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      try {
        const { synced, failed } = await runFullSync(root);
        if (failed > 0) {
          alert(`Synced ${synced} item(s). ${failed} item(s) failed and remain queued — check your connection and try again.`);
        }
      } catch (err) {
        alert(err.message || 'Could not sync right now — check your connection.');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
}

async function loadSettingsPage(root) {
  const saveBtn = document.getElementById('settingsSaveBtn');
  const langSelect = document.getElementById('setLanguage');

  // Language select applies immediately (matches the topbar switcher) and
  // isn't part of the batched "Save Settings" payload below.
  if (langSelect && !langSelect.dataset.wired) {
    langSelect.dataset.wired = '1';
    langSelect.innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${l.name} — ${l.native}</option>`).join('');
    langSelect.value = getLanguage();
    langSelect.addEventListener('change', () => setLanguage(langSelect.value));
  }

  if (!saveBtn || saveBtn.dataset.wired) return;
  saveBtn.dataset.wired = '1';

  const ids = {
    notifyCritical: 'setNotifyCritical',
    notifyHighRisk: 'setNotifyHighRisk',
    notifyUpdates: 'setNotifyUpdates',
    notifySound: 'setNotifySound',
    mapDefaultLayer: 'setMapLayer',
    refreshIntervalSeconds: 'setRefreshInterval',
  };

  try {
    const { settings } = await settingsApi.get();
    Object.entries(ids).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!settings[key];
      else el.value = String(settings[key]);
    });
    if (langSelect && settings.language) langSelect.value = settings.language;
  } catch (err) {
    console.warn('Could not load settings:', err.message);
  }

  saveBtn.addEventListener('click', async () => {
    const payload = {};
    Object.entries(ids).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      payload[key] = el.type === 'checkbox' ? el.checked : /Interval/.test(id) ? Number(el.value) : el.value;
    });
    const msgEl = document.getElementById('settingsSaveMsg');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await settingsApi.update(payload);
      if (msgEl) {
        msgEl.style.color = 'var(--success)';
        msgEl.textContent = 'Saved.';
        setTimeout(() => (msgEl.textContent = ''), 2500);
      }
    } catch (err) {
      if (msgEl) {
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = err.message || 'Could not save settings.';
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  });
}

function loadLiveData(root) {
  loadDashboardData(root);
  loadRoadsData(root);
  loadVehiclesData(root);
  loadDeliveriesData(root);
  loadAlertsPageData(root);
  loadReportsData(root);
  wireRouteOptimizationPage(root);
  wireSyncButtons(root);
  loadSyncPageData(root);
  loadSettingsPage(root);
  loadDisasterFeed();
  initLiveMap(root);
}

/* ---------- Master init, called after every page render ---------- */
export function initPageBehaviors(root) {
  if (!root) return;
  wireRoleTabs(root);
  wireOtpBoxes(root);
  wireFieldEyes(root);

  wireIncidentPhoto('incidentPhotoDesktop', 'incidentPhotoPreviewDesktop');
  wireIncidentPhoto('incidentGalleryDesktop', 'incidentPhotoPreviewDesktop');
  wireIncidentPhoto('incidentPhotoMobile', 'incidentPhotoPreviewMobile');
  wireIncidentPhoto('incidentGalleryMobile', 'incidentPhotoPreviewMobile');

  wireSeverityButtons('incidentSeverityDesktop');
  wireSeverityButtons('incidentSeverityMobile');
  wireIncidentSubmit('Desktop');
  wireIncidentSubmit('Mobile');

  wireVehiclePhoto('vehiclePhotoDesktop');
  wireVehiclePhoto('vehiclePhotoMobile');

  if (root.querySelector('#weatherLocDesktop') || root.querySelector('#weatherLocMobile')) {
    fetchLiveWeather('Desktop');
    fetchLiveWeather('Mobile');
  }

  if (root.querySelector('[data-page="profile"]') || document.getElementById('profileNameDesktop')) {
    populateAccountProfile();
  }

  const topbarNameEl = document.getElementById('topbarUserName');
  if (topbarNameEl) topbarNameEl.textContent = currentDisplayName() || 'Director';
  wireLanguageSwitcher(root);
  applyTranslations(root);

  loadLiveData(root);
}

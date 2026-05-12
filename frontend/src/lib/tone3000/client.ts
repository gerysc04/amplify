import type { SearchParams, SearchResult, Tone } from './types';

const T3_BASE    = 'https://www.tone3000.com/api/v1';
const PUB_KEY    = import.meta.env.VITE_TONE3000_KEY ?? '';
const API_BASE   = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const TOKEN_KEY   = 'tone3000-token';
const REFRESH_KEY = 'tone3000-refresh';

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function saveTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

// ---------------------------------------------------------------------------
// OAuth — backend handles PKCE + secret, frontend just redirects
// ---------------------------------------------------------------------------

export async function startOAuth(): Promise<void> {
  const redirectUri = window.location.origin + '/';
  const r = await fetch(`${API_BASE}/api/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
  if (!r.ok) throw new Error('Could not get OAuth URL from server');
  const { url } = await r.json();
  window.location.href = url;
}

export async function handleOAuthCallback(code: string, state: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/auth/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state, redirect_uri: window.location.origin + '/' }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail ?? 'Token exchange failed');
  }
  const data = await r.json();
  saveTokens(data.access_token, data.refresh_token);
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;
  const r = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!r.ok) { logout(); return false; }
  const data = await r.json();
  saveTokens(data.access_token, data.refresh_token);
  return true;
}

// ---------------------------------------------------------------------------
// tone3000 API — called directly from the browser using the publishable key
// The user's access token authenticates the request; the pub key identifies the app.
// ---------------------------------------------------------------------------

function t3Headers(): HeadersInit {
  const token = getToken();
  const h: Record<string, string> = {
    'X-API-Key': PUB_KEY,
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function t3Fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${T3_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let r = await fetch(url.toString(), { headers: t3Headers() });

  if (r.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) throw new Error('Session expired — please reconnect tone3000');
    r = await fetch(url.toString(), { headers: t3Headers() });
  }

  if (!r.ok) throw new Error(`tone3000 API error ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Backend fetch — used only for user-specific data (presets)
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  let r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts?.headers },
  });

  if (r.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) throw new Error('Session expired');
    r = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...opts?.headers },
    });
  }

  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchTones(p: SearchParams): Promise<SearchResult> {
  const params: Record<string, string> = {};
  if (p.q)         params.q         = p.q;
  if (p.gears)     params.gears     = p.gears;
  if (p.platform)  params.platform  = p.platform;
  if (p.sort)      params.sort      = p.sort;
  if (p.page)      params.page      = String(p.page);
  if (p.page_size) params.page_size = String(p.page_size);
  return t3Fetch<SearchResult>('/tones/search', params);
}

export async function getTone(id: number): Promise<Tone> {
  return t3Fetch<Tone>(`/tones/${id}`);
}

/** Gets the direct download URL then fetches the file directly — never through our server. */
export async function downloadToneFile(toneId: number, filename: string): Promise<File> {
  const models = await t3Fetch<unknown>('/models', { tone_id: String(toneId) });
  const first = (models as any).data?.[0];
  if (!first?.model_url) throw new Error('No model file available for this tone');

  const r = await fetch(first.model_url, { headers: t3Headers() });
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  const buf  = await r.arrayBuffer();
  const name = first.name ? `${first.name}.nam` : filename;
  return new File([buf], name, { type: 'application/octet-stream' });
}

// Backend preset CRUD
export const presetsApi = {
  list:   ()                   => apiFetch<object[]>('/api/presets'),
  create: (body: object)       => apiFetch('/api/presets', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, b: object) => apiFetch(`/api/presets/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  remove: (id: string)         => apiFetch(`/api/presets/${id}`, { method: 'DELETE' }),
};

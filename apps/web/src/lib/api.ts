import { API_URL } from './utils';

export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];

  constructor(status: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Désactive la redirection automatique vers /login sur 401 (sondes de session). */
  redirectOn401?: boolean;
}

const PUBLIC_PATH_PREFIXES = ['/login', '/legal'];

/** Client API : cookies de session inclus, erreurs normalisées. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (
    res.status === 401 &&
    options.redirectOn401 !== false &&
    typeof window !== 'undefined' &&
    !PUBLIC_PATH_PREFIXES.some((prefix) => window.location.pathname.startsWith(prefix))
  ) {
    window.location.href = '/login?error=session_expired';
  }

  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    let issues;
    try {
      const data = await res.json();
      message = data.message ?? message;
      issues = data.issues;
    } catch {
      /* réponse non-JSON */
    }
    throw new ApiError(res.status, message, issues);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

/** Upload multipart d'une pièce jointe. */
export async function uploadFile(file: File): Promise<import('@yurei/shared').UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/uploads`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message ?? "Échec de l'upload");
  }
  return res.json();
}

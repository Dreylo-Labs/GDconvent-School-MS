const API_URL = import.meta.env.VITE_API_URL || '/api';

export const session = {
  get token() { return localStorage.getItem('gd-app-token'); },
  set token(value: string | null) { value ? localStorage.setItem('gd-app-token', value) : localStorage.removeItem('gd-app-token'); },
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}), ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Something went wrong. Please try again.');
  }
  return response.json();
}

export async function download(path: string, filename: string) {
  const response = await fetch(`${API_URL}${path}`, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} });
  if (!response.ok) throw new Error('The document is not available yet.');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

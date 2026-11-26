const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: { Accept: 'application/json', ...headers },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(503, 'সার্ভারের সাথে সংযোগ করা যাচ্ছে না। Backend চালু আছে কি না এবং Netlify-তে VITE_API_BASE_URL সঠিকভাবে সেট করা হয়েছে কি না যাচাই করুন।');
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (contentType.includes('text/html') || /^\s*<!doctype html/i.test(text)) {
    throw new ApiError(503, 'Backend API পাওয়া যায়নি। Netlify শুধু Frontend প্রকাশ করেছে। আলাদা Node.js Backend চালু করে VITE_API_BASE_URL সেট করুন, তারপর আবার Deploy দিন।');
  }
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, errMsg);
  }

  return data as T;
}

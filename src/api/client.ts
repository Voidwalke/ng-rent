import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { logError } from '../lib/errorLogger';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
});

// Auto-set Content-Type: json for non-FormData, let axios handle FormData
api.interceptors.request.use((config) => {
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Unwrap backend envelope { data, meta } ───
// Backend wraps ALL responses via TransformInterceptor:
//   { data: payload, meta: {} }        → non-paginated single object
//   { data: items[], meta: {} }        → list without pagination meta
//   { data: items[], meta: { total } } → paginated list
// After unwrap:
//   array payload  → always { data: items[], total, ...meta } (paginated shape)
//   object payload → unwrap to payload directly
api.interceptors.response.use(
  (response) => {
    // Skip unwrap for blob/arraybuffer responses (file downloads)
    if (response.config.responseType === 'blob' || response.config.responseType === 'arraybuffer') {
      return response;
    }
    const body = response.data;
    if (body && typeof body === 'object' && 'data' in body && 'meta' in body) {
      const meta = body.meta ?? {};
      if (Array.isArray(body.data)) {
        // List response — always keep paginated structure
        response.data = {
          data: body.data,
          total: meta.total ?? body.data.length,
          ...meta,
        };
      } else {
        // Single object — unwrap to just the payload
        response.data = body.data;
      }
    }
    return response;
  },
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data: raw } = await api.post('/auth/refresh', { refreshToken });
        const payload = raw?.data ?? raw;
        const newAccessToken: string = payload.accessToken;
        const newRefreshToken: string = payload.refreshToken;

        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        logError(
          refreshError instanceof Error ? refreshError : new Error(String(refreshError)),
          'api/client: 401 refresh failed',
        );
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    logError(
      error instanceof Error ? error : new Error(String(error)),
      `api/client: ${error.response?.status ?? 'network'} ${(error.config as any)?.url ?? ''}`,
    );
    return Promise.reject(error);
  },
);

export default api;

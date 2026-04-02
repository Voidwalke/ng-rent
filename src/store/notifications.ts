import { create } from 'zustand';
import { notificationsApi } from '../api/endpoints';
import type { Notification } from '../types';

interface NotificationsState {
  items: Notification[];
  unreadCount: number;
  isLoading: boolean;

  fetchUnreadCount: () => Promise<void>;
  fetchAll: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  items: [],
  unreadCount: 0,
  isLoading: false,

  fetchUnreadCount: async () => {
    if (!localStorage.getItem('accessToken')) return;
    try {
      const count = await notificationsApi.unreadCount();
      set({ unreadCount: count });
    } catch {
      // silent
    }
  },

  fetchAll: async () => {
    set({ isLoading: true });
    try {
      const res = await notificationsApi.list({ page: 1, limit: 50 });
      set({ items: res.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  markRead: async (id) => {
    await notificationsApi.markRead(id);
    set((s) => ({
      items: s.items.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await notificationsApi.markAllRead();
    set((s) => ({
      items: s.items.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
  },
}));

import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { router } from './routes';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useThemeStore } from './store/theme';

const App: React.FC = () => {
  const { isDark } = useThemeStore();

  React.useEffect(() => {
    document.body.style.background = isDark ? '#141414' : '#f5f5f5';
  }, [isDark]);

  const themeConfig = {
    token: {
      colorPrimary: '#2563eb',
      borderRadius: 8,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={ruRU} theme={themeConfig}>
          <AntApp>
            <RouterProvider router={router} />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

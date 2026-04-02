import { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button } from 'antd';
import { logError } from '../lib/errorLogger';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError(error, `ErrorBoundary: ${errorInfo.componentStack ?? ''}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Произошла ошибка"
          subTitle="Что-то пошло не так. Попробуйте перезагрузить страницу."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Перезагрузить
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}

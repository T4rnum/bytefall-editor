import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorReport, useErrorStore } from '../store/errorStore';

interface State {
  readonly failed: boolean;
  readonly copied: boolean;
}

/**
 * Если React упал целиком, вместо пустого окна — что случилось и что делать. Работа не
 * пропала: автосохранение предложит её вернуть после перезагрузки.
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false, copied: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = info.componentStack
      ? `${error.stack ?? ''}\n${info.componentStack}`
      : error.stack;
    useErrorStore.getState().record(Object.assign(error, { stack }), 'render');
  }

  private copy = (): void => {
    void navigator.clipboard.writeText(errorReport()).then(() => this.setState({ copied: true }));
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <h1>Редактор споткнулся</h1>
        <p>
          Несохранённая работа не пропала: после перезагрузки редактор предложит её вернуть. Отчёт
          об ошибке — без содержимого документа — можно скопировать и прислать.
        </p>
        <div className="crash-actions">
          <button
            type="button"
            className="crash-button crash-button--primary"
            onClick={() => location.reload()}
          >
            Перезагрузить
          </button>
          <button type="button" className="crash-button" onClick={this.copy}>
            {this.state.copied ? 'Отчёт скопирован' : 'Скопировать отчёт'}
          </button>
        </div>
      </div>
    );
  }
}

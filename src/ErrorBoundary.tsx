import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The iPad has no reachable console, so an error that escapes React would
 * otherwise blank the screen silently. This prints it where it can be read on
 * the device, including the user agent, which is what identifies a Safari that
 * cannot run something the bundle uses.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string }
> {
  state = { error: null as Error | null, info: '' };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? '' });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="h-full overflow-auto p-5 text-[13px] leading-relaxed font-mono">
        <strong className="text-[15px]">{error.name || 'Error'}</strong>
        <pre className="whitespace-pre-wrap break-words my-3">{error.message}</pre>
        {error.stack && (
          <pre className="whitespace-pre-wrap break-words text-base-content/60">{error.stack}</pre>
        )}
        {info && (
          <pre className="whitespace-pre-wrap break-words text-base-content/60">{info}</pre>
        )}
        <hr className="my-3 border-base-content/20" />
        <pre className="whitespace-pre-wrap break-words text-base-content/50">
          {navigator.userAgent}
        </pre>
      </div>
    );
  }
}

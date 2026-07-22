import React from "react";

// Catches render errors anywhere below it and shows a recoverable screen
// instead of a blank white page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI error caught by ErrorBoundary:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="errbox">
          <h2>مشکلی در نمایش این بخش پیش آمد</h2>
          <p className="muted-sm">برنامه از کار نیفتاد. می‌توانی به صفحهٔ اصلی برگردی یا صفحه را تازه کنی.</p>
          <pre className="err-detail">{String(this.state.error?.message || this.state.error)}</pre>
          <div className="err-actions">
            <button className="btn ghost sm" onClick={() => location.reload()}>تازه‌سازی صفحه</button>
            <button className="btn gold sm" onClick={() => { this.reset(); location.hash = ""; if (this.props.onReset) this.props.onReset(); }}>
              بازگشت به صفحهٔ اصلی
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

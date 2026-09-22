export function LoadingState({ message = "Đang tải dữ liệu..." }: { message?: string }) {
  return <section className="state-card" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>{message}</p></section>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <section className="state-card"><div className="state-icon" aria-hidden="true">○</div><h2>{title}</h2><p>{message}</p></section>;
}

export function ErrorState({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry?: () => void }) {
  return (
    <section className="state-card state-error" role="alert">
      <div className="state-icon" aria-hidden="true">!</div>
      <h2>Đã xảy ra lỗi</h2>
      <p>{message}</p>
      {requestId && <p className="request-id">Mã yêu cầu: {requestId}</p>}
      {onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}
    </section>
  );
}

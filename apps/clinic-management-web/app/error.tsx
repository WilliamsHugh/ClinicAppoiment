"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="layout">
      <h1>Không thể tải trang</h1>
      <button type="button" onClick={reset}>Thử lại</button>
    </main>
  );
}

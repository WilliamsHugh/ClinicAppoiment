export interface PaginationState {
  page: number;
  pageCount: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export function getPaginationState(page: number, limit: number, total: number): PaginationState {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / safeLimit));
  const currentPage = Math.min(pageCount, Math.max(1, Math.trunc(page)));
  return {
    page: currentPage,
    pageCount,
    canGoPrevious: currentPage > 1,
    canGoNext: currentPage < pageCount
  };
}

export function Pagination({
  page,
  limit,
  total,
  disabled = false,
  onPageChange
}: {
  page: number;
  limit: number;
  total: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}) {
  const state = getPaginationState(page, limit, total);

  return (
    <nav className="pagination" aria-label="Phân trang">
      <button
        type="button"
        aria-label="Trang trước"
        disabled={disabled || !state.canGoPrevious}
        onClick={() => onPageChange(state.page - 1)}
      >
        Trang trước
      </button>
      <span aria-live="polite" aria-atomic="true">
        Trang <strong>{state.page}</strong> / {state.pageCount}
      </span>
      <button
        type="button"
        aria-label="Trang sau"
        disabled={disabled || !state.canGoNext}
        onClick={() => onPageChange(state.page + 1)}
      >
        Trang sau
      </button>
    </nav>
  );
}

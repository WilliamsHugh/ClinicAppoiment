import { EmptyState } from "./states";

export function PagePlaceholder({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <EmptyState title="Chưa có dữ liệu hiển thị" message="Nhóm phụ trách domain sẽ thay vùng này bằng luồng nghiệp vụ." />
    </section>
  );
}

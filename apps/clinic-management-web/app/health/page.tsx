import { HealthPanel } from "../../src/features/health/health-panel";

export default function HealthPage() {
  return (
    <section className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">Administration</p>
        <h1>Sức khỏe hệ thống</h1>
        <p>Trạng thái tổng hợp do API Gateway cung cấp cho quản trị viên.</p>
      </header>
      <HealthPanel />
    </section>
  );
}

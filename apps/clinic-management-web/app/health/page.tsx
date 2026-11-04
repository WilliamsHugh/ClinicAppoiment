import { HealthPanel } from "../../src/features/health/health-panel";
import { PageHeader } from "../../src/components/page-header";

export default function HealthPage() {
  return (
    <section className="page-stack">
      <PageHeader pathname="/health" />
      <HealthPanel />
    </section>
  );
}

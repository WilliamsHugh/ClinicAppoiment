"use client";

import { useState } from "react";
import { Button } from "../../src/components/ui";
import { PageHeader } from "../../src/components/page-header";
import { AppointmentsPanel } from "../../src/features/appointments/appointments-panel";
import { QueueBoard } from "../../src/features/appointments/queue-board";
import { PatientLookupDrawer } from "../../src/features/users/patient-lookup-drawer";

export default function AppointmentsPage() {
  const [view, setView] = useState<"appointments" | "queue">("appointments");

  if (view === "queue") {
    return (
      <section>
        <PageHeader
          pathname="/appointments"
          actions={<Button variant="secondary" type="button" onClick={() => setView("appointments")}>Danh sách lịch hẹn</Button>}
        />
        <QueueBoard PatientLookup={PatientLookupDrawer} hideHeader />
      </section>
    );
  }

  return <AppointmentsPanel onOpenQueue={() => setView("queue")} />;
}

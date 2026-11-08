import { QueueBoard } from "../../src/features/appointments/queue-board";
import { PatientLookupDrawer } from "../../src/features/users/patient-lookup-drawer";

export default function AppointmentsPage() {
  return <QueueBoard PatientLookup={PatientLookupDrawer} />;
}

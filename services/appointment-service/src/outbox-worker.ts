import { z } from "zod";
import { type OutboxEvent, PostgresAppointmentRepository } from "./postgres-repository.js";

const patientResponse = z.object({ success: z.literal(true), data: z.object({ id: z.string().uuid(),
  userId: z.string().uuid() }) });
const deliverable = new Set(["appointment.created", "appointment.confirmed", "appointment.rescheduled",
  "appointment.cancelled", "appointment.checked_in"]);

export class AppointmentOutboxWorker {
  private running = false;
  constructor(private readonly repository: PostgresAppointmentRepository,
    private readonly userUrl: string, private readonly notificationUrl: string,
    private readonly send: typeof fetch = fetch) {}

  async dispatchBatch() {
    if (this.running) return 0;
    this.running = true;
    try {
      const events = await this.repository.claimOutbox();
      for (const event of events) {
        try {
          await this.dispatch(event);
          await this.repository.markOutboxSent(event.id, event.claimToken);
        } catch (caught) {
          const code = caught instanceof DeliveryError ? caught.code : "DELIVERY_UNAVAILABLE";
          await this.repository.deferOutbox(event.id, event.claimToken, code);
          console.warn(JSON.stringify({ eventId: event.id, eventType: event.eventType, code }));
        }
      }
      return events.length;
    } finally { this.running = false; }
  }

  private async dispatch(event: OutboxEvent) {
    if (!deliverable.has(event.eventType)) return;
    const { appointmentId, patientId, scheduledStartAt } = event.payload;
    if (!appointmentId || !patientId || !scheduledStartAt) throw new DeliveryError("EVENT_PAYLOAD_INVALID");
    let recipientUserId: string;
    try {
      const userToken = process.env.USER_APPOINTMENT_INTERNAL_API_TOKEN;
      if (!userToken || Buffer.byteLength(userToken, "utf8") < 32) throw new Error();
      const response = await this.send(`${this.userUrl}/internal/v1/patients/${encodeURIComponent(patientId)}`,
        { headers: { "X-Internal-Token": userToken }, redirect: "error", signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error();
      const patient = patientResponse.parse(await response.json()).data;
      if (patient.id !== patientId) throw new Error();
      recipientUserId = patient.userId;
    } catch { throw new DeliveryError("PATIENT_LOOKUP_UNAVAILABLE"); }
    const token = process.env.NOTIFICATION_INTERNAL_API_TOKEN;
    if (!token || Buffer.byteLength(token, "utf8") < 32)
      throw new DeliveryError("NOTIFICATION_CREDENTIAL_UNAVAILABLE");
    let response: Response;
    try {
      response = await this.send(`${this.notificationUrl}/internal/v1/notifications`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(4000),
        headers: { "Content-Type": "application/json", "X-Internal-Token": token },
        body: JSON.stringify({ eventId: event.id, type: event.eventType,
          payload: { appointmentId, patientId, scheduledStartAt, recipientUserId } })
      });
    } catch { throw new DeliveryError("NOTIFICATION_UNAVAILABLE"); }
    if (!response.ok) throw new DeliveryError(`NOTIFICATION_HTTP_${response.status}`);
  }
}

class DeliveryError extends Error { constructor(readonly code: string) { super(code); } }

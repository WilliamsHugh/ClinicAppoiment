import type { RequestHandler } from "express";
import { z } from "zod";
import type { UserRepository } from "./repository.js";

const idSchema = z.string().uuid();
type PatientLookupRepository = Pick<UserRepository, "findPatientById" | "findPatientByUserId">;

export function createPatientLookupHandler(
  repository: PatientLookupRepository,
  key: "id" | "userId",
): RequestHandler {
  return async (req, res) => {
    const parsed = idSchema.safeParse(req.params[key]);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: {
        code: "VALIDATION_ERROR", message: "A valid ID is required", details: [],
      } });
    }
    const patient = key === "id"
      ? await repository.findPatientById(parsed.data)
      : await repository.findPatientByUserId(parsed.data);
    if (!patient) {
      return res.status(404).json({ success: false, error: {
        code: "PATIENT_NOT_FOUND", message: "Patient not found", details: [],
      } });
    }
    return res.json({ success: true, data: { id: patient.id, userId: patient.userId } });
  };
}

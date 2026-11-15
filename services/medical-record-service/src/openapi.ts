const error = { description: "Error response", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const record = {
  type: "object",
  required: ["id", "appointmentId", "patientId", "doctorId", "status", "version", "appointmentCompletion", "prescription", "createdBy", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    appointmentId: { type: "string", format: "uuid" },
    patientId: { type: "string", format: "uuid" },
    doctorId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["DRAFT", "FINAL"] },
    version: { type: "integer", minimum: 1 },
    appointmentCompletion: { type: "string", enum: ["NOT_REQUESTED", "PENDING", "COMPLETED"] },
    symptoms: { type: "string" },
    diagnosis: { type: "string" },
    notes: { type: "string" },
    treatmentPlan: { type: "string" },
    prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } },
    createdBy: { type: "string", format: "uuid" },
    updatedBy: { type: "string", format: "uuid" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" }
  }
};

const response = (schema: object) => ({
  description: "Success",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["success", "data"],
        properties: { success: { type: "boolean", enum: [true] }, data: schema }
      }
    }
  }
});

const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const clinicalGrantHeader = { name: "X-Clinical-Grant", in: "header", required: false, schema: { type: "string", format: "uuid" } };
const publicErrors = { "400": error, "401": error, "403": error, "404": error, "409": error, "422": error, "503": error };

export const openapi = {
  openapi: "3.0.3",
  info: { title: "Medical Record Service", version: "2.0.0" },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      internalToken: { type: "apiKey", in: "header", name: "X-Internal-Token" }
    },
    schemas: {
      PrescriptionItem: {
        type: "object",
        required: ["medicineName", "dosage", "frequency", "duration"],
        properties: Object.fromEntries(
          ["medicineName", "dosage", "frequency", "duration"].map(key => [key, { type: "string", minLength: 1 }])
        )
      },
      MedicalRecord: record,
      ClinicalGrant: {
        type: "object",
        required: ["id", "sessionId", "doctorId", "patientId", "appointmentId", "accessMode", "issuedAt", "expiresAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          sessionId: { type: "string" },
          doctorId: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          appointmentId: { type: "string", format: "uuid" },
          recordId: { type: "string", format: "uuid", nullable: true },
          accessMode: { type: "string", enum: ["CURRENT_ENCOUNTER", "AUTHORED_HISTORY"] },
          issuedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          revokedAt: { type: "string", format: "date-time", nullable: true }
        }
      },
      FinalizationContext: {
        type: "object",
        required: ["contextId", "appointmentId", "expectedVersion", "contentDigest", "expiresAt"],
        properties: {
          contextId: { type: "string", format: "uuid" },
          appointmentId: { type: "string", format: "uuid" },
          recordId: { type: "string", format: "uuid", nullable: true },
          expectedVersion: { type: "integer", minimum: 0 },
          contentDigest: { type: "string" },
          expiresAt: { type: "string", format: "date-time" }
        }
      },
      Error: {
        type: "object",
        required: ["success", "error", "requestId"],
        properties: {
          success: { type: "boolean", enum: [false] },
          requestId: { type: "string" },
          error: {
            type: "object",
            required: ["code", "message", "details"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "object" } }
            }
          }
        }
      }
    }
  },
  paths: {
    "/health": {
      get: {
        summary: "Check Medical Record database readiness",
        security: [],
        responses: {
          "200": response({ type: "object", properties: { service: { type: "string" }, status: { type: "string" } } }),
          "503": error
        }
      }
    },
    "/api/v1/medical-records/access-grants": {
      post: {
        summary: "Issue a time-bounded clinical access grant for a doctor encounter",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["verificationProofId", "accessMode", "appointmentId", "patientId"],
                properties: {
                  verificationProofId: { type: "string", minLength: 1 },
                  accessMode: { type: "string", enum: ["CURRENT_ENCOUNTER", "AUTHORED_HISTORY"] },
                  appointmentId: { type: "string", format: "uuid" },
                  patientId: { type: "string", format: "uuid" },
                  recordId: { type: "string", format: "uuid" }
                }
              }
            }
          }
        },
        responses: {
          "201": response({ $ref: "#/components/schemas/ClinicalGrant" }),
          ...publicErrors
        }
      }
    },
    "/api/v1/medical-records/finalization-contexts": {
      post: {
        summary: "Bind appointment, record version and content digest for finalization",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["appointmentId", "expectedVersion", "record"],
                properties: {
                  appointmentId: { type: "string", format: "uuid" },
                  recordId: { type: "string", format: "uuid" },
                  expectedVersion: { type: "integer", minimum: 0 },
                  record: {
                    type: "object",
                    properties: {
                      symptoms: { type: "string" },
                      diagnosis: { type: "string" },
                      notes: { type: "string" },
                      treatmentPlan: { type: "string" },
                      prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": response({ $ref: "#/components/schemas/FinalizationContext" }),
          ...publicErrors
        }
      }
    },
    "/internal/v1/medical-records/access-grants/verify": {
      post: {
        summary: "Verify internal clinical access grant validity",
        security: [{ internalToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["grantId", "patientId", "appointmentId"],
                properties: {
                  grantId: { type: "string", format: "uuid" },
                  patientId: { type: "string", format: "uuid" },
                  appointmentId: { type: "string", format: "uuid" },
                  actorUserId: { type: "string", format: "uuid" },
                  sessionId: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": response({
            type: "object",
            required: ["valid"],
            properties: {
              valid: { type: "boolean" },
              accessMode: { type: "string" },
              expiresAt: { type: "string", format: "date-time" },
              reason: { type: "string" }
            }
          }),
          "401": error,
          "503": error
        }
      }
    },
    "/api/v1/medical-records": {
      get: {
        summary: "List records visible to the actor according to scope and view",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...["page", "limit", "patientId", "doctorId", "appointmentId"].map(name => ({
            name, in: "query", required: false,
            schema: name === "page" || name === "limit"
              ? { type: "integer", minimum: 1, maximum: name === "limit" ? 100 : undefined }
              : { type: "string", format: "uuid" }
          })),
          { name: "scope", in: "query", required: false, schema: { type: "string", enum: ["authored", "patient-history"] } },
          { name: "view", in: "query", required: false, schema: { type: "string", enum: ["summary", "detail"] } },
          clinicalGrantHeader
        ],
        responses: {
          "200": response({
            type: "object",
            required: ["items", "page", "limit", "total"],
            properties: {
              items: { type: "array", items: { $ref: "#/components/schemas/MedicalRecord" } },
              page: { type: "integer" },
              limit: { type: "integer" },
              total: { type: "integer" }
            }
          }),
          ...publicErrors
        }
      },
      post: {
        summary: "Create a draft or final record for an eligible appointment",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["appointmentId", "patientId", "doctorId"],
                properties: {
                  appointmentId: { type: "string", format: "uuid" },
                  patientId: { type: "string", format: "uuid" },
                  doctorId: { type: "string", format: "uuid" },
                  status: { type: "string", enum: ["DRAFT", "FINAL"] },
                  symptoms: { type: "string" },
                  diagnosis: { type: "string" },
                  notes: { type: "string" },
                  treatmentPlan: { type: "string" },
                  prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } },
                  verificationProofId: { type: "string" },
                  contextId: { type: "string", format: "uuid" }
                }
              }
            }
          }
        },
        responses: {
          "201": response({ $ref: "#/components/schemas/MedicalRecord" }),
          ...publicErrors
        }
      }
    },
    "/api/v1/medical-records/{id}": {
      get: {
        summary: "Read a clinical record",
        security: [{ bearerAuth: [] }],
        parameters: [id, clinicalGrantHeader],
        responses: {
          "200": response({ $ref: "#/components/schemas/MedicalRecord" }),
          ...publicErrors
        }
      },
      patch: {
        summary: "Update clinical fields or finalize a draft record",
        security: [{ bearerAuth: [] }],
        parameters: [id],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["DRAFT", "FINAL"] },
                  expectedVersion: { type: "integer", minimum: 1 },
                  verificationProofId: { type: "string" },
                  contextId: { type: "string", format: "uuid" },
                  symptoms: { type: "string" },
                  diagnosis: { type: "string" },
                  notes: { type: "string" },
                  treatmentPlan: { type: "string" },
                  prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } }
                }
              }
            }
          }
        },
        responses: {
          "200": response({ $ref: "#/components/schemas/MedicalRecord" }),
          ...publicErrors
        }
      }
    },
    "/api/v1/medical-records/{id}/finalize": {
      post: {
        summary: "Finalize a draft record using TOTP verification proof",
        security: [{ bearerAuth: [] }],
        parameters: [id],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contextId", "verificationProofId", "expectedVersion"],
                properties: {
                  contextId: { type: "string", format: "uuid" },
                  verificationProofId: { type: "string", minLength: 1 },
                  expectedVersion: { type: "integer", minimum: 1 },
                  record: {
                    type: "object",
                    properties: {
                      symptoms: { type: "string" },
                      diagnosis: { type: "string" },
                      notes: { type: "string" },
                      treatmentPlan: { type: "string" },
                      prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": response({ $ref: "#/components/schemas/MedicalRecord" }),
          ...publicErrors
        }
      }
    },
    "/internal/v1/medical-records/by-appointment/{appointmentId}": {
      get: {
        summary: "Minimal final-record context for Appointment Service",
        security: [{ internalToken: [] }],
        parameters: [{ name: "appointmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": response({
            type: "object",
            required: ["id", "appointmentId", "patientId", "doctorId", "status", "version", "appointmentCompletion", "createdBy"],
            properties: {
              id: { type: "string", format: "uuid" },
              appointmentId: { type: "string", format: "uuid" },
              patientId: { type: "string", format: "uuid" },
              doctorId: { type: "string", format: "uuid" },
              status: { type: "string", enum: ["DRAFT", "FINAL"] },
              version: { type: "integer" },
              appointmentCompletion: { type: "string", enum: ["NOT_REQUESTED", "PENDING", "COMPLETED"] },
              createdBy: { type: "string", format: "uuid" },
              updatedBy: { type: "string", format: "uuid" }
            }
          }),
          "401": error,
          "404": error,
          "503": error
        }
      }
    }
  }
};

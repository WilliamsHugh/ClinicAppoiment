import { isDeepStrictEqual } from "node:util";
import type { MfaChallengeRecord, MfaFactorRecord, MfaProofRecord, UserRepository } from "./repository.js";
import { buildOtpauthUrl, generateTotpSecret, verifyTotpCode } from "./totp.js";
import type { MfaPurpose } from "./types/internal-proof-verify.js";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const PROOF_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CHALLENGE_ATTEMPTS = 5;

export class MfaService {
  constructor(private readonly repository: UserRepository) {}

  async enrollTotp(
    userId: string,
    userEmail: string,
  ): Promise<{ factorId: string; secret: string; qrCode: string }> {
    const secret = generateTotpSecret(20);
    const factor = await this.repository.createMfaFactor(userId, secret, "totp", "unverified");
    const qrCode = buildOtpauthUrl("Health&Human Clinic", userEmail, secret);

    return {
      factorId: factor.id,
      secret,
      qrCode,
    };
  }

  async listFactors(userId: string): Promise<Array<{ factorId: string; type: "totp"; status: "unverified" | "verified"; createdAt: string }>> {
    const factors = await this.repository.findMfaFactorsByUserId(userId);
    return factors.map((f) => ({
      factorId: f.id,
      type: f.type,
      status: f.status,
      createdAt: f.createdAt,
    }));
  }

  async createChallenge(input: {
    factorId: string;
    userId: string;
    sessionId?: string | null;
    purpose: MfaPurpose;
    context?: Record<string, unknown>;
    now?: Date;
  }): Promise<{ challengeId: string; purpose: MfaPurpose; expiresAt: string }> {
    const factor = await this.repository.findMfaFactorById(input.factorId);
    if (!factor || factor.userId !== input.userId) {
      throw new Error("MFA_FACTOR_NOT_FOUND");
    }
    if (input.purpose !== "ENROLL_TOTP" && factor.status !== "verified") {
      throw new Error("MFA_FACTOR_NOT_VERIFIED");
    }

    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

    const challenge = await this.repository.createMfaChallenge({
      factorId: input.factorId,
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      purpose: input.purpose,
      context: input.context ?? {},
      expiresAt,
      maxAttempts: MAX_CHALLENGE_ATTEMPTS,
    });

    return {
      challengeId: challenge.id,
      purpose: input.purpose,
      expiresAt: challenge.expiresAt,
    };
  }

  async verifyChallenge(input: {
    challengeId: string;
    code: string;
    sessionId?: string;
    now?: Date;
  }): Promise<{
    success: boolean;
    purpose: MfaPurpose;
    factorId: string;
    proofId?: string;
    expiresAt?: string;
    context?: Record<string, unknown>;
    error?: string;
  }> {
    const challenge = await this.repository.findMfaChallengeById(input.challengeId);
    if (!challenge) {
      return { success: false, purpose: "ENROLL_TOTP", factorId: "", error: "MFA_CHALLENGE_NOT_FOUND" };
    }

    const now = input.now ?? new Date();
    const expMs = new Date(challenge.expiresAt).getTime();
    if (challenge.verifiedAt) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_CHALLENGE_USED" };
    }
    if (challenge.sessionId && input.sessionId !== challenge.sessionId) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_SESSION_MISMATCH" };
    }
    if (now.getTime() > expMs) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_CHALLENGE_EXPIRED" };
    }

    if (challenge.attemptCount >= challenge.maxAttempts) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_RATE_LIMITED" };
    }

    if (challenge.attemptCount > 0 && challenge.lastAttemptAt &&
      now.getTime() - new Date(challenge.lastAttemptAt).getTime() < 30_000) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_RATE_LIMITED" };
    }

    const attempts = await this.repository.incrementChallengeAttempt(challenge.id);
    if (attempts === 0 || attempts > challenge.maxAttempts) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_RATE_LIMITED" };
    }

    const factor = await this.repository.findMfaFactorById(challenge.factorId);
    if (!factor) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_FACTOR_NOT_FOUND" };
    }

    const valid = verifyTotpCode(factor.secretEncrypted, input.code, 1, now.getTime());
    if (!valid) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_CODE_INVALID" };
    }

    // Code is valid! Mark challenge verified
    if (!await this.repository.markChallengeVerified(challenge.id)) {
      return { success: false, purpose: challenge.purpose as MfaPurpose, factorId: challenge.factorId, error: "MFA_CHALLENGE_USED" };
    }

    // If enrolling, verify factor status
    if (challenge.purpose === "ENROLL_TOTP") {
      await this.repository.updateMfaFactorStatus(factor.id, "verified");
    }

    // For purpose requiring proof, generate single-use proof
    let proofId: string | undefined;
    let proofExpiresAt: string | undefined;
    const sessionId = input.sessionId ?? challenge.sessionId;

    if (
      (challenge.purpose === "OPEN_CLINICAL_RECORDS" ||
        challenge.purpose === "FINALIZE_MEDICAL_RECORD" ||
        challenge.purpose === "AUTHORIZE_SENSITIVE_OPERATION") &&
      sessionId
    ) {
      const proofExp = new Date(now.getTime() + PROOF_TTL_MS);
      const proof = await this.repository.createMfaProof({
        userId: challenge.userId,
        sessionId,
        challengeId: challenge.id,
        purpose: challenge.purpose,
        context: challenge.context,
        expiresAt: proofExp,
      });
      proofId = proof.id;
      proofExpiresAt = proof.expiresAt;
    }

    return {
      success: true,
      purpose: challenge.purpose as MfaPurpose,
      factorId: challenge.factorId,
      proofId,
      expiresAt: proofExpiresAt,
      context: challenge.context,
    };
  }

  async verifyProof(input: {
    proofId: string;
    purpose: MfaPurpose;
    actorUserId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
    now?: Date;
  }): Promise<{ valid: boolean; proof?: MfaProofRecord; reason?: string }> {
    const proof = await this.repository.findMfaProofById(input.proofId);
    if (!proof) {
      return { valid: false, reason: "PROOF_NOT_FOUND" };
    }

    if (proof.consumedAt) {
      return { valid: false, reason: "PROOF_ALREADY_CONSUMED" };
    }

    const now = input.now ?? new Date();
    const expMs = new Date(proof.expiresAt).getTime();
    if (now.getTime() > expMs) {
      return { valid: false, reason: "PROOF_EXPIRED" };
    }

    if (proof.purpose !== input.purpose) {
      return { valid: false, reason: "PROOF_PURPOSE_MISMATCH" };
    }

    if (input.actorUserId && proof.userId !== input.actorUserId) {
      return { valid: false, reason: "PROOF_ACTOR_MISMATCH" };
    }

    if (input.sessionId && proof.sessionId !== input.sessionId) {
      return { valid: false, reason: "PROOF_SESSION_MISMATCH" };
    }
    if (input.context && !isDeepStrictEqual(proof.context, input.context)) {
      return { valid: false, reason: "PROOF_CONTEXT_MISMATCH" };
    }

    return { valid: true, proof };
  }

  async consumeProof(proofId: string, consumer?: string): Promise<boolean> {
    return this.repository.consumeMfaProof(proofId, consumer);
  }
}

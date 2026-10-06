import type { RequestHandler } from "express";
import { z } from "zod";
import type { UserRepository } from "./repository.js";

const userIdSchema = z.string().uuid();

export function createDoctorEligibilityHandler(repository: Pick<UserRepository, "findUserById">): RequestHandler {
  return async (req, res, next) => {
    const parsed = userIdSchema.safeParse(req.params.userId);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid user ID", details: [] } });
      return;
    }

    try {
      const user = await repository.findUserById(parsed.data);
      if (!user) {
        res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found", details: [] } });
        return;
      }
      res.json({ success: true, data: { id: user.id, role: user.role, status: user.status } });
    } catch (error) {
      next(error);
    }
  };
}

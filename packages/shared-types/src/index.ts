export type Role = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";

export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type Page<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};


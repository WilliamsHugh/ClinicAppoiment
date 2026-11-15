export function formatVietnamDate(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatVietnamDateTime(date: Date | string): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return typeof date === "string" ? date : "";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return typeof date === "string" ? date : "";
  }
}

export function formatVietnamTime(date: Date | string): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return typeof date === "string" ? date : "";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return typeof date === "string" ? date : "";
  }
}

export function getVietnamTodayISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getVietnamDayRange(date: Date = new Date()): { startUtc: string; endUtc: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  // Vietnam is UTC+7 (no DST). Local 00:00:00 corresponds to UTC 17:00:00 of the previous calendar day.
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 7 * 3600 * 1000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

export function formatVietnamDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

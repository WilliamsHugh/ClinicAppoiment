"use client";

import { ErrorState } from "../src/components/states";

export default function Error({ reset }: { reset: () => void }) {
  return <ErrorState message="Không thể tải trang." onRetry={reset} />;
}

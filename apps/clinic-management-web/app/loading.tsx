"use client";

import { usePathname } from "next/navigation";
import { routeForPath } from "../src/lib/navigation/routes";
import { RouteLoadingFallback } from "../src/components/route-guard";
import { ClinicLandingPage } from "../src/features/landing/clinic-landing-page";

export default function Loading() {
  const pathname = usePathname();
  if (pathname === "/") return <ClinicLandingPage />;
  const route = pathname ? routeForPath(pathname) : undefined;
  return <RouteLoadingFallback pathname={pathname || "/"} route={route} />;
}

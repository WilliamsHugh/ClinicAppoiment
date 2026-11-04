"use client";

import { usePathname } from "next/navigation";
import { routeForPath } from "../src/lib/navigation/routes";
import { RouteLoadingFallback } from "../src/components/route-guard";

export default function Loading() {
  const pathname = usePathname();
  const route = pathname ? routeForPath(pathname) : undefined;
  return <RouteLoadingFallback pathname={pathname || "/"} route={route} />;
}

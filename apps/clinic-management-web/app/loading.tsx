import { SkeletonPage } from "../src/components/ui/skeleton";

export default function Loading() {
  return <SkeletonPage title={true} tableRows={6} tableCols={5} />;
}

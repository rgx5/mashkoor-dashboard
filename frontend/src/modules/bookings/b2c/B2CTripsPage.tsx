import { BOOKING_STATUS_LABELS, PRODUCT_TYPE_LABELS, type BookingStatus } from "@mashkoor/shared";
import { Luggage } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { useMyTrips } from "./api";

const tone = (s: BookingStatus) => (s === "CONFIRMED" || s === "COMPLETED" ? "green" : s === "CANCELLED" || s === "FAILED" ? "red" : "plum");

export function B2CTripsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const { data, isLoading, error } = useMyTrips(page);

  if (isLoading) return <FullPageSpinner />;
  if (error) return <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>;

  return (
    <>
      <PageHeader title="My trips" />
      {data?.data.length === 0 && <EmptyState icon={Luggage} title="No trips yet" description="Send us a trip request and our team will prepare your booking." />}
      <div className="space-y-3">
        {data?.data.map((b) => (
          <Link key={b.id} to={`/b2c/trips/${b.id}`} className="block">
            <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-plum-200 hover:shadow-sm">
              <div>
                <p className="font-semibold">
                  {PRODUCT_TYPE_LABELS[b.productType]}
                  {b.destination ? ` · ${b.destination}` : ""}
                </p>
                <p className="text-xs text-ink-500">
                  {b.refNo} · {b.travelFrom ? `${formatDate(b.travelFrom)} → ${formatDate(b.travelTo)}` : "Dates to be confirmed"}
                </p>
              </div>
              <div className="text-right">
                <Badge tone={tone(b.status)}>{BOOKING_STATUS_LABELS[b.status]}</Badge>
                <p className="mt-1 text-sm font-semibold">{formatINR(b.totalSell)}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {data && data.meta.total > data.meta.pageSize && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled={page * data.meta.pageSize >= data.meta.total} onClick={() => setParams({ page: String(page + 1) })}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}

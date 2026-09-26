import { ITINERARY_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@mashkoor/shared";
import { Compass, ExternalLink } from "lucide-react";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useMyItineraries } from "@/modules/bookings/b2c/api";

/** Trip plans our team has shared with the signed-in customer. */
export function B2CItinerariesPage() {
  const { data, isLoading, error } = useMyItineraries();
  return (
    <>
      <PageHeader title="Trip plans" description="Plans our team has prepared for you." />
      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-600">{errorMessage(error)}</p>}
      {data?.length === 0 && (
        <Card>
          <EmptyState icon={Compass} title="No plans yet" description="When our team shares a trip plan with you, it appears here." />
        </Card>
      )}
      <div className="space-y-3">
        {data?.map((i) => (
          <Card key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{i.title}</p>
              <p className="text-xs text-ink-500">
                {PRODUCT_TYPE_LABELS[i.productType]}
                {i.destination ? ` · ${i.destination}` : ""}
                {i.travelFrom ? ` · ${formatDate(i.travelFrom)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={i.status === "ACCEPTED" || i.status === "CONVERTED" ? "green" : "plum"}>{ITINERARY_STATUS_LABELS[i.status]}</Badge>
              <span className="font-semibold">{formatINR(i.totalPrice)}</span>
              {i.shareUrl && (
                <a href={i.shareUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-plum-700 hover:underline">
                  View <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

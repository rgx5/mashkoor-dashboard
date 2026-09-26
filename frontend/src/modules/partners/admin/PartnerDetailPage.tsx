import { PARTNER_STATUS_LABELS, WALLET_CREDIT_TYPES, WALLET_ENTRY_TYPE_LABELS, type WalletLedgerRow } from "@mashkoor/shared";
import { AlertTriangle, Ban, Check, RotateCcw, UserPlus, Wallet, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatDateTime, formatINR } from "@/core/format";
import { Button, buttonClass } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { Field, FormError, inputClass, TextareaField, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { BackLink, DetailList, Tabs } from "@/core/ui/misc";
import { FullPageSpinner, Spinner } from "@/core/ui/Spinner";
import { useAdjustWallet, useSetCreditLimit, useTopUpWallet, useWalletLedger, useWalletSummary } from "@/modules/wallet";
import { PartnerUsersPanel } from "../PartnerUsersPanel";
import { useApprovePartner, useInvitePartnerAdmin, usePartner, useReinstatePartner, useRejectPartner, useSuspendPartner } from "../api";

type Tab = "profile" | "wallet" | "users";

export function PartnerDetailPage() {
  const { id = "" } = useParams();
  const { data: partner, isLoading, error } = usePartner(id);
  const [tab, setTab] = useState<Tab>("profile");
  const [inviting, setInviting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const approve = useApprovePartner();
  const reinstate = useReinstatePartner();

  if (isLoading) return <FullPageSpinner />;
  if (error || !partner)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Partner not available"
        description={errorMessage(error)}
        action={
          <Link to="/admin/partners" className={buttonClass("secondary")}>
            Back to partners
          </Link>
        }
      />
    );

  return (
    <>
      <BackLink to="/admin/partners">Partners</BackLink>

      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{partner.companyName}</h1>
              <Badge tone={partner.status === "APPROVED" ? "green" : partner.status === "PENDING" ? "amber" : "red"}>{PARTNER_STATUS_LABELS[partner.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {partner.refNo} · {partner.contactName} · {partner.phone} · {partner.email}
            </p>
            {partner.rejectedReason && <p className="mt-2 text-sm text-red-600">Reason: {partner.rejectedReason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {partner.status === "PENDING" && (
              <>
                <Button size="sm" onClick={() => withToast(approve.mutateAsync(partner.id), "Partner approved")}>
                  <Check className="h-4 w-4" aria-hidden /> Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => setRejecting(true)}>
                  <X className="h-4 w-4" aria-hidden /> Reject
                </Button>
              </>
            )}
            {partner.status === "APPROVED" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setInviting(true)}>
                  <UserPlus className="h-4 w-4" aria-hidden /> Invite admin
                </Button>
                <Button size="sm" variant="danger" onClick={() => setSuspending(true)}>
                  <Ban className="h-4 w-4" aria-hidden /> Suspend
                </Button>
              </>
            )}
            {partner.status === "SUSPENDED" && (
              <Button size="sm" onClick={() => withToast(reinstate.mutateAsync(partner.id), "Partner reinstated")}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Reinstate
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: "profile", label: "Profile & KYC" },
          { value: "wallet", label: "Wallet" },
          { value: "users", label: "Users", count: partner.userCount },
        ]}
      />

      {tab === "profile" && (
        <Card className="p-5">
          <DetailList
            items={[
              { label: "City", value: partner.city },
              { label: "State", value: partner.state },
              { label: "GST number", value: partner.gstNumber },
              { label: "PAN number", value: partner.panNumber },
              { label: "Applied", value: formatDate(partner.createdAt) },
            ]}
          />
          {partner.kycDocuments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-ink-700">KYC documents</h3>
              <ul className="space-y-1">
                {partner.kycDocuments.map((d, i) => (
                  <li key={i}>
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-plum-700 hover:underline">
                      {d.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {partner.notes && <p className="mt-4 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink-700">{partner.notes}</p>}
        </Card>
      )}

      {tab === "wallet" && <WalletTab partnerId={partner.id} balance={partner.balance} creditLimit={partner.creditLimit} />}

      {tab === "users" && <PartnerUsersPanel scope={{ portal: "admin", partnerId: partner.id }} canManage={partner.status === "APPROVED"} />}

      <RejectDialog partnerId={partner.id} open={rejecting} onClose={() => setRejecting(false)} />
      <SuspendDialog partnerId={partner.id} open={suspending} onClose={() => setSuspending(false)} />
      <InviteAdminDialog partnerId={partner.id} open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}

function WalletTab({ partnerId, balance, creditLimit }: { partnerId: string; balance: number; creditLimit: number }) {
  const { data: summary } = useWalletSummary("admin", partnerId);
  const [page, setPage] = useState(1);
  const { data: ledger, isLoading } = useWalletLedger("admin", page, partnerId);
  const [action, setAction] = useState<"topup" | "adjust" | "limit" | null>(null);

  const bal = summary?.balance ?? balance;
  const limit = summary?.creditLimit ?? creditLimit;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-6 p-5">
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase">Balance</p>
          <p className={cn("text-2xl font-bold", bal < 0 && "text-red-600")}>{formatINR(bal)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase">Credit limit</p>
          <p className="text-2xl font-bold">{formatINR(limit)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase">Available</p>
          <p className="text-2xl font-bold text-emerald-700">{formatINR(bal + limit)}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setAction("topup")}>
            Top up
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("adjust")}>
            Adjust
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("limit")}>
            Credit limit
          </Button>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4" aria-hidden /> Ledger
          </h3>
        </div>
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!isLoading && ledger?.data.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">No entries yet.</p>}
        <ul className="divide-y divide-line">
          {ledger?.data.map((e: WalletLedgerRow) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{WALLET_ENTRY_TYPE_LABELS[e.type]}</span>
                {e.note && <span className="ml-2 text-ink-500">{e.note}</span>}
                <span className="block text-xs text-ink-500">
                  {formatDateTime(e.createdAt)} {e.createdBy && `· ${e.createdBy.name}`}
                </span>
              </span>
              <span className="text-right">
                <span className={cn("block font-semibold", WALLET_CREDIT_TYPES.has(e.type) ? "text-emerald-700" : "text-red-600")}>
                  {WALLET_CREDIT_TYPES.has(e.type) ? "+" : "−"}
                  {formatINR(e.amount)}
                </span>
                <span className="text-xs text-ink-500">Balance {formatINR(e.balanceAfter)}</span>
              </span>
            </li>
          ))}
        </ul>
        {ledger && ledger.meta.total > ledger.meta.pageSize && (
          <div className="flex justify-end gap-1 border-t border-line p-3">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="ghost" size="sm" disabled={page * ledger.meta.pageSize >= ledger.meta.total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </Card>

      <WalletActionDialog partnerId={partnerId} action={action} onClose={() => setAction(null)} />
    </div>
  );
}

function WalletActionDialog({ partnerId, action, onClose }: { partnerId: string; action: "topup" | "adjust" | "limit" | null; onClose: () => void }) {
  const topUp = useTopUpWallet();
  const adjust = useAdjustWallet();
  const setLimit = useSetCreditLimit();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;
  const close = () => {
    setAmount("");
    setNote("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      if (action === "topup") await topUp.mutateAsync({ partnerId, input: { amount: Number(amount), note } });
      else if (action === "adjust") await adjust.mutateAsync({ partnerId, input: { direction, amount: Number(amount), note } });
      else await setLimit.mutateAsync({ partnerId, creditLimit: Number(amount) });
      toast.success("Wallet updated");
      close();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const title = action === "topup" ? "Top up wallet" : action === "adjust" ? "Adjust wallet" : "Set credit limit";

  return (
    <Dialog open onClose={close} title={title}>
      <div className="space-y-4">
        <FormError message={error} />
        {action === "adjust" && (
          <Field label="Direction">
            <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className={inputClass}>
              <option value="CREDIT">Credit (add funds)</option>
              <option value="DEBIT">Debit (remove funds)</option>
            </select>
          </Field>
        )}
        <TextField label={action === "limit" ? "Credit limit (₹)" : "Amount (₹)"} type="number" min={0} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        {action !== "limit" && <TextareaField label="Note" required value={note} onChange={(e) => setNote(e.target.value)} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!amount || (action !== "limit" && !note.trim())} loading={topUp.isPending || adjust.isPending || setLimit.isPending}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RejectDialog({ partnerId, open, onClose }: { partnerId: string; open: boolean; onClose: () => void }) {
  const reject = useRejectPartner();
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title="Reject application">
      <div className="space-y-4">
        <TextareaField label="Reason" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!reason.trim()} loading={reject.isPending} onClick={() => withToast(reject.mutateAsync({ id: partnerId, reason }), "Application rejected").then(onClose)}>
            Reject
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function SuspendDialog({ partnerId, open, onClose }: { partnerId: string; open: boolean; onClose: () => void }) {
  const suspend = useSuspendPartner();
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title="Suspend partner" description="Their users won't be able to sign in until reinstated.">
      <div className="space-y-4">
        <TextareaField label="Reason" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!reason.trim()} loading={suspend.isPending} onClick={() => withToast(suspend.mutateAsync({ id: partnerId, reason }), "Partner suspended").then(onClose)}>
            Suspend
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function InviteAdminDialog({ partnerId, open, onClose }: { partnerId: string; open: boolean; onClose: () => void }) {
  const invite = useInvitePartnerAdmin();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const submit = async () => {
    setError(null);
    try {
      await invite.mutateAsync({ id: partnerId, name, email });
      toast.success(`Invitation sent to ${email}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open onClose={onClose} title="Invite Partner Admin">
      <div className="space-y-4">
        <FormError message={error} />
        <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || !email.trim()} loading={invite.isPending} onClick={submit}>
            Send invite
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

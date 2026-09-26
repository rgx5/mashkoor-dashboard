import type { ImportEntity, ImportResult, ImportRowResult } from "@mashkoor/shared";
import { CheckCircle2, Download, FileUp, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Badge, Card, PageHeader } from "@/core/ui/layout";
import { SegmentedControl } from "@/core/ui/misc";
import { useRunImport } from "../api";
import { csvToObjects, downloadCsv } from "../csv";

const TEMPLATES: Record<ImportEntity, { headers: string[]; example: string[]; help: string }> = {
  customers: {
    headers: ["Name", "Phone", "Email", "City", "State", "Type", "Source", "Tags", "Notes"],
    example: ["Ayesha Khan", "9820012345", "ayesha@example.com", "Mumbai", "Maharashtra", "INDIVIDUAL", "REFERRAL", "vip;umrah", "Prefers morning flights"],
    help: "Name and phone are required. Anyone whose phone or email is already a customer is skipped.",
  },
  leads: {
    headers: ["Name", "Phone", "Email", "Destination", "Product type", "Adults", "Children", "Source", "Priority", "Notes"],
    example: ["Imran Sheikh", "9930011223", "", "Makkah & Madinah", "HOLIDAY", "4", "1", "WEBSITE", "HOT", "Wants to travel in Ramadan"],
    help: "Name and phone are required. Leads are created unassigned so a manager can hand them out.",
  },
};

const rowTone = (s: ImportRowResult["status"]) => (s === "valid" || s === "imported" ? "green" : s === "duplicate" ? "amber" : "red");

/** Bring customers or leads in from a spreadsheet: preview every row first, then import the good ones. */
export function ImportPage() {
  const [entity, setEntity] = useState<ImportEntity>("customers");
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = useRunImport();
  const input = useRef<HTMLInputElement>(null);
  const template = TEMPLATES[entity];

  const reset = () => {
    setRows(null);
    setResult(null);
    setFileName("");
    if (input.current) input.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    try {
      const parsed = csvToObjects(await file.text());
      if (parsed.length === 0) {
        toast.error("That file has no data rows. The first row must be the column headings.");
        return reset();
      }
      setRows(parsed);
      setFileName(file.name);
      setResult(await run.mutateAsync({ entity, commit: false, rows: parsed }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const commit = async () => {
    if (!rows) return;
    try {
      const done = await run.mutateAsync({ entity, commit: true, rows });
      setResult(done);
      toast.success(`${done.imported} ${entity} imported`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Import data" description="Bring customers or leads in from a spreadsheet (save it as CSV)." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl<ImportEntity>
          options={[
            { value: "customers", label: "Customers" },
            { value: "leads", label: "Leads" },
          ]}
          value={entity}
          onChange={(v) => {
            setEntity(v);
            reset();
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => downloadCsv(`${entity}-template.csv`, [template.headers, template.example])}>
          <Download className="h-4 w-4" aria-hidden /> Download template
        </Button>
      </div>

      <Card className="mb-4 p-5">
        <p className="mb-3 text-sm text-ink-700">{template.help}</p>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-6 py-8 text-center hover:border-plum-300 hover:bg-plum-50/40">
          <FileUp className="h-8 w-8 text-plum-600" aria-hidden />
          <span className="text-sm font-semibold">{fileName ? fileName : "Choose a CSV file"}</span>
          <span className="text-xs text-ink-500">Up to 2,000 rows. Column headings can be in any order.</span>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </Card>

      {run.isPending && !result && <p className="text-sm text-ink-500">Checking your file…</p>}

      {result && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="green">{result.committed ? `${result.imported} imported` : `${result.valid} ready to import`}</Badge>
            {result.duplicates > 0 && <Badge tone="amber">{result.duplicates} already exist</Badge>}
            {result.invalid > 0 && <Badge tone="red">{result.invalid} need fixing</Badge>}
            <span className="text-xs text-ink-500">of {result.total} rows</span>
            <span className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={reset}>
                {result.committed ? "Import another file" : "Start over"}
              </Button>
              {!result.committed && (
                <Button size="sm" onClick={() => void commit()} loading={run.isPending} disabled={result.valid === 0}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Import {result.valid} {entity}
                </Button>
              )}
            </span>
          </div>
          {result.invalid > 0 && !result.committed && (
            <p className="mb-3 flex gap-2 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Rows that need fixing will be skipped. Fix them in your file and import again, or import the rest now.
            </p>
          )}
          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Name / phone</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="px-3 py-2 text-ink-500">{r.line}</td>
                    <td className="px-3 py-2 font-semibold">{r.label}</td>
                    <td className="px-3 py-2">
                      <Badge tone={rowTone(r.status)}>{r.status === "valid" ? "Ready" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge>
                      {r.errors.map((e) => (
                        <p key={e} className="mt-1 text-xs text-ink-500">{e}</p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

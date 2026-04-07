// @ts-nocheck
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  FlaskConical,
  HeartPulse,
  Upload,
} from "lucide-react";
import { EmptyState } from "../../../components/ui/coachos";
import { Skeleton } from "../../../components/ui/coachos/skeleton";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { useSessionAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { getSupabaseErrorMessage } from "../../../lib/supabase-errors";
import { validateMedicalDocumentFile } from "../../../lib/upload-validation";

type PtClientMedicalTabProps = {
  clientId: string | null;
  workspaceId: string | null;
  enabled: boolean;
};

const getErrorMessage = (error: unknown) => getSupabaseErrorMessage(error);

const getFriendlyErrorMessage = () =>
  "Unable to load data right now. Please try again.";

const sanitizeStorageFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "medical-report";

const formatShortDate = (
  value: string | null | undefined,
  fallback = "Not scheduled",
) => {
  if (!value) return fallback;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatFileSize = (value: number | null | undefined) => {
  if (!value || value <= 0) return "Size unavailable";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

export function PtClientMedicalTab({
  clientId,
  workspaceId,
  enabled,
}: PtClientMedicalTabProps) {
  const { user } = useSessionAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyNotes, setHistoryNotes] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [labName, setLabName] = useState("");
  const [labValue, setLabValue] = useState("");
  const [labUnit, setLabUnit] = useState("");
  const [labDate, setLabDate] = useState("");
  const [labNotes, setLabNotes] = useState("");
  const [labStatus, setLabStatus] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [labMessage, setLabMessage] = useState<string | null>(null);
  const [documentLabel, setDocumentLabel] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentStatus, setDocumentStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [documentMessage, setDocumentMessage] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(
    null,
  );

  const recordsQuery = useQuery({
    queryKey: ["pt-client-medical-records", clientId, workspaceId],
    enabled: enabled && !!clientId && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_medical_records")
        .select(
          "id, entry_type, title, result_value, unit, observed_at, notes, created_at",
        )
        .eq("client_id", clientId ?? "")
        .eq("workspace_id", workspaceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["pt-client-medical-documents", clientId, workspaceId],
    enabled: enabled && !!clientId && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_medical_documents")
        .select(
          "id, label, file_name, mime_type, file_size, storage_path, observed_at, created_at",
        )
        .eq("client_id", clientId ?? "")
        .eq("workspace_id", workspaceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const historyEntries = useMemo(
    () =>
      (recordsQuery.data ?? []).filter(
        (entry) => entry.entry_type === "history",
      ),
    [recordsQuery.data],
  );

  const labEntries = useMemo(
    () =>
      (recordsQuery.data ?? []).filter(
        (entry) => entry.entry_type === "lab_result",
      ),
    [recordsQuery.data],
  );

  const handleSaveHistory = async () => {
    const trimmedTitle = historyTitle.trim();
    const trimmedNotes = historyNotes.trim();
    if (!clientId || !workspaceId || !user?.id || trimmedTitle.length === 0) {
      return;
    }
    setHistoryStatus("saving");
    setHistoryMessage(null);
    const { error } = await supabase.from("client_medical_records").insert({
      client_id: clientId,
      workspace_id: workspaceId,
      entry_type: "history",
      title: trimmedTitle,
      observed_at: historyDate || null,
      notes: trimmedNotes || null,
      created_by: user.id,
    });

    if (error) {
      setHistoryStatus("error");
      setHistoryMessage(getErrorMessage(error));
      return;
    }

    setHistoryTitle("");
    setHistoryDate("");
    setHistoryNotes("");
    setHistoryStatus("idle");
    setHistoryMessage("Medical history saved.");
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-medical-records", clientId, workspaceId],
    });
  };

  const handleSaveLabResult = async () => {
    const trimmedName = labName.trim();
    const trimmedValue = labValue.trim();
    const trimmedUnit = labUnit.trim();
    const trimmedNotes = labNotes.trim();
    if (
      !clientId ||
      !workspaceId ||
      !user?.id ||
      trimmedName.length === 0 ||
      trimmedValue.length === 0
    ) {
      return;
    }
    setLabStatus("saving");
    setLabMessage(null);
    const { error } = await supabase.from("client_medical_records").insert({
      client_id: clientId,
      workspace_id: workspaceId,
      entry_type: "lab_result",
      title: trimmedName,
      result_value: trimmedValue,
      unit: trimmedUnit || null,
      observed_at: labDate || null,
      notes: trimmedNotes || null,
      created_by: user.id,
    });

    if (error) {
      setLabStatus("error");
      setLabMessage(getErrorMessage(error));
      return;
    }

    setLabName("");
    setLabValue("");
    setLabUnit("");
    setLabDate("");
    setLabNotes("");
    setLabStatus("idle");
    setLabMessage("Lab result saved.");
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-medical-records", clientId, workspaceId],
    });
  };

  const handleUploadDocument = async () => {
    if (!clientId || !workspaceId || !user?.id || !documentFile) return;
    setDocumentStatus("saving");
    setDocumentMessage(null);
    try {
      validateMedicalDocumentFile(documentFile);
    } catch (error) {
      setDocumentStatus("error");
      setDocumentMessage(
        error instanceof Error ? error.message : "Invalid medical document.",
      );
      return;
    }
    const sanitizedFileName = sanitizeStorageFileName(documentFile.name);
    const storagePath = `${clientId}/${crypto.randomUUID()}-${sanitizedFileName}`;
    const { error: uploadError } = await supabase.storage
      .from("medical_documents")
      .upload(storagePath, documentFile, {
        upsert: false,
        contentType: documentFile.type || "application/octet-stream",
      });

    if (uploadError) {
      setDocumentStatus("error");
      setDocumentMessage(getErrorMessage(uploadError));
      return;
    }

    const { error: insertError } = await supabase
      .from("client_medical_documents")
      .insert({
        client_id: clientId,
        workspace_id: workspaceId,
        label: documentLabel.trim() || null,
        file_name: documentFile.name,
        mime_type: documentFile.type || null,
        file_size: documentFile.size || null,
        storage_path: storagePath,
        observed_at: documentDate || null,
        uploaded_by: user.id,
      });

    if (insertError) {
      await supabase.storage.from("medical_documents").remove([storagePath]);
      setDocumentStatus("error");
      setDocumentMessage(getErrorMessage(insertError));
      return;
    }

    setDocumentLabel("");
    setDocumentDate("");
    setDocumentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDocumentStatus("idle");
    setDocumentMessage("Medical report uploaded.");
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-medical-documents", clientId, workspaceId],
    });
  };

  const handleOpenDocument = async (documentRow: {
    id: string;
    storage_path: string | null;
  }) => {
    if (!documentRow.storage_path) return;
    setOpeningDocumentId(documentRow.id);
    const { data, error } = await supabase.storage
      .from("medical_documents")
      .createSignedUrl(documentRow.storage_path, 60 * 10);
    setOpeningDocumentId(null);

    if (error || !data?.signedUrl) {
      setDocumentStatus("error");
      setDocumentMessage(error ? getErrorMessage(error) : "Unable to open file.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]">
      <div className="space-y-6">
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-primary" />
              Medical history
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Record diagnoses, surgeries, medications, injuries, or anything
              that should stay in the coaching workspace.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                History item
              </label>
              <Input
                value={historyTitle}
                onChange={(event) => setHistoryTitle(event.target.value)}
                placeholder="Ex: Prior ACL reconstruction, thyroid medication, low back pain history"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="pt-medical-history-date"
                className="text-xs font-semibold text-muted-foreground"
              >
                Relevant date
              </label>
              <Input
                id="pt-medical-history-date"
                type="date"
                value={historyDate}
                onChange={(event) => setHistoryDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Notes
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={historyNotes}
                onChange={(event) => setHistoryNotes(event.target.value)}
                placeholder="Capture context that should follow programming and check-in decisions."
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                onClick={handleSaveHistory}
                disabled={
                  historyStatus === "saving" || historyTitle.trim().length === 0
                }
              >
                {historyStatus === "saving" ? "Saving..." : "Add history item"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {historyMessage ?? "Visible only in the client medical record."}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              Add lab result
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Log individual test values without leaving the client workspace.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_120px_120px]">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Test name
                </label>
                <Input
                  value={labName}
                  onChange={(event) => setLabName(event.target.value)}
                  placeholder="Ex: HbA1c, Vitamin D, LDL"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Value
                </label>
                <Input
                  value={labValue}
                  onChange={(event) => setLabValue(event.target.value)}
                  placeholder="5.7"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Unit
                </label>
                <Input
                  value={labUnit}
                  onChange={(event) => setLabUnit(event.target.value)}
                  placeholder="%"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="pt-medical-lab-date"
                className="text-xs font-semibold text-muted-foreground"
              >
                Test date
              </label>
              <Input
                id="pt-medical-lab-date"
                type="date"
                value={labDate}
                onChange={(event) => setLabDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Notes
              </label>
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={labNotes}
                onChange={(event) => setLabNotes(event.target.value)}
                placeholder="Optional context, trend notes, or coaching implications."
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                onClick={handleSaveLabResult}
                disabled={
                  labStatus === "saving" ||
                  labName.trim().length === 0 ||
                  labValue.trim().length === 0
                }
              >
                {labStatus === "saving" ? "Saving..." : "Add test result"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {labMessage ?? "Name, value, and unit keep results scan-friendly."}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Upload report
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Attach a lab report, bloodwork PDF, or photo of medical results.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Label
                </label>
                <Input
                  value={documentLabel}
                  onChange={(event) => setDocumentLabel(event.target.value)}
                  placeholder="Ex: March blood panel"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="pt-medical-report-date"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Report date
                </label>
                <Input
                  id="pt-medical-report-date"
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                File
              </label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={(event) =>
                  setDocumentFile(event.target.files?.[0] ?? null)
                }
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              Accepts PDF and image uploads. Files stay private and open through
              signed URLs.
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                onClick={handleUploadDocument}
                disabled={documentStatus === "saving" || !documentFile}
              >
                {documentStatus === "saving" ? "Uploading..." : "Upload report"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {documentMessage ??
                  (documentFile
                    ? `${documentFile.name} selected`
                    : "Attach a PDF or image file.")}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Medical history timeline</CardTitle>
            <p className="text-sm text-muted-foreground">
              Operational history that should shape programming and coaching
              decisions.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {recordsQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : recordsQuery.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {getFriendlyErrorMessage()}
              </div>
            ) : historyEntries.length > 0 ? (
              historyEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border/60 bg-background/35 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {entry.title}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatShortDate(entry.observed_at, "No date recorded")}
                    </span>
                  </div>
                  {entry.notes ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {entry.notes}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                title="No medical history recorded"
                description="Add history items here so key context stays attached to the client, not buried in messages."
                icon={<HeartPulse className="h-5 w-5" />}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Lab results</CardTitle>
            <p className="text-sm text-muted-foreground">
              Structured test values stay easy to compare at a glance.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {recordsQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : recordsQuery.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {getFriendlyErrorMessage()}
              </div>
            ) : labEntries.length > 0 ? (
              labEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border/60 bg-background/35 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {entry.title}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {entry.result_value}
                        {entry.unit ? ` ${entry.unit}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatShortDate(entry.observed_at, "No date recorded")}
                    </span>
                  </div>
                  {entry.notes ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {entry.notes}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                title="No lab results yet"
                description="Use structured values for labs you want to review quickly during programming and check-ins."
                icon={<FlaskConical className="h-5 w-5" />}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Uploaded reports</CardTitle>
            <p className="text-sm text-muted-foreground">
              File attachments for PDFs, scans, screenshots, and report photos.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {documentsQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : documentsQuery.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {getFriendlyErrorMessage()}
              </div>
            ) : (documentsQuery.data ?? []).length > 0 ? (
              (documentsQuery.data ?? []).map((documentRow) => (
                <div
                  key={documentRow.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/35 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {documentRow.label?.trim() || documentRow.file_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {documentRow.file_name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatFileSize(documentRow.file_size)}</span>
                      <span>•</span>
                      <span>
                        {formatShortDate(
                          documentRow.observed_at,
                          formatShortDate(documentRow.created_at),
                        )}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleOpenDocument(documentRow)}
                    disabled={openingDocumentId === documentRow.id}
                  >
                    {openingDocumentId === documentRow.id ? "Opening..." : "Open"}
                  </Button>
                </div>
              ))
            ) : (
              <EmptyState
                title="No uploaded reports yet"
                description="Upload bloodwork PDFs or result screenshots here so the medical record stays attached to the client."
                icon={<FileText className="h-5 w-5" />}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

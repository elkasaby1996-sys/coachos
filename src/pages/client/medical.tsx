import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FlaskConical, HeartPulse, Upload } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { supabase } from "../../lib/supabase";
import { useSessionAuth } from "../../lib/auth";

type ClientMedicalProfile = {
  id: string;
  workspace_id: string | null;
  display_name: string | null;
};

type MedicalRecordRow = {
  id: string;
  entry_type: "history" | "lab_result";
  title: string;
  result_value: string | null;
  unit: string | null;
  observed_at: string | null;
  notes: string | null;
  created_at: string | null;
};

type MedicalDocumentRow = {
  id: string;
  label: string | null;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  observed_at: string | null;
  created_at: string | null;
};

const sanitizeStorageFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "medical-report";

const formatFileSize = (value: number | null | undefined) => {
  if (!value || value <= 0) return "Size unavailable";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

const formatShortDate = (
  value: string | null | undefined,
  fallback = "No date recorded",
) => {
  if (!value) return fallback;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: string | null }).message;
    return message ?? "Something went wrong.";
  }
  return "Something went wrong.";
};

export function ClientMedicalPage() {
  const { session } = useSessionAuth();
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

  const clientQuery = useQuery({
    queryKey: ["client-medical-profile", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, display_name")
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as ClientMedicalProfile | null;
    },
  });

  const clientId = clientQuery.data?.id ?? null;
  const workspaceId = clientQuery.data?.workspace_id ?? null;

  const recordsQuery = useQuery({
    queryKey: ["client-medical-records", clientId, workspaceId],
    enabled: !!clientId && !!workspaceId,
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
      return (data ?? []) as MedicalRecordRow[];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["client-medical-documents", clientId, workspaceId],
    enabled: !!clientId && !!workspaceId,
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
      return (data ?? []) as MedicalDocumentRow[];
    },
  });

  const historyEntries = useMemo(
    () =>
      (recordsQuery.data ?? []).filter((entry) => entry.entry_type === "history"),
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
    if (!clientId || !workspaceId || !session?.user?.id || trimmedTitle.length === 0) {
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
      created_by: session.user.id,
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
      queryKey: ["client-medical-records", clientId, workspaceId],
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
      !session?.user?.id ||
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
      created_by: session.user.id,
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
      queryKey: ["client-medical-records", clientId, workspaceId],
    });
  };

  const handleUploadDocument = async () => {
    if (!clientId || !workspaceId || !session?.user?.id || !documentFile) return;
    setDocumentStatus("saving");
    setDocumentMessage(null);

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
        uploaded_by: session.user.id,
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
      queryKey: ["client-medical-documents", clientId, workspaceId],
    });
  };

  const handleOpenDocument = async (documentRow: MedicalDocumentRow) => {
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
    <div className="portal-shell">
      <PortalPageHeader
        title="Medical"
        subtitle="Keep your medical history, test values, and uploaded reports in one place for your coaching workflow."
        stateText={
          clientQuery.data?.display_name
            ? `Shared with ${clientQuery.data.display_name}'s coach`
            : "Shared with your coach"
        }
      />

      <StatusBanner
        variant="info"
        title="Your coach can review anything entered here"
        description="Medical history, lab values, and uploaded files are visible inside the PT medical workspace so your program can reflect the right context."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-6">
          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-primary" />
                <SurfaceCardTitle>Medical history</SurfaceCardTitle>
              </div>
              <SurfaceCardDescription>
                Add diagnoses, surgeries, injuries, medications, or anything
                else your coach should know.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-4">
              <SectionCard className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    History item
                  </label>
                  <Input
                    value={historyTitle}
                    onChange={(event) => setHistoryTitle(event.target.value)}
                    placeholder="Ex: Previous shoulder surgery, asthma, current medication"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Relevant date
                  </label>
                  <Input
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
                    placeholder="Share any detail that matters for training, nutrition, or recovery."
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleSaveHistory}
                    disabled={
                      historyStatus === "saving" ||
                      historyTitle.trim().length === 0
                    }
                  >
                    {historyStatus === "saving" ? "Saving..." : "Add history item"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {historyMessage ?? "This updates your coach's medical view too."}
                  </span>
                </div>
              </SectionCard>
            </SurfaceCardContent>
          </SurfaceCard>

          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <SurfaceCardTitle>Lab result</SurfaceCardTitle>
              </div>
              <SurfaceCardDescription>
                Enter a single test with its value and unit so your coach can
                scan it quickly.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-4">
              <SectionCard className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_120px_120px]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Test name
                    </label>
                    <Input
                      value={labName}
                      onChange={(event) => setLabName(event.target.value)}
                      placeholder="Ex: Vitamin D, HbA1c, Ferritin"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Value
                    </label>
                    <Input
                      value={labValue}
                      onChange={(event) => setLabValue(event.target.value)}
                      placeholder="42"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Unit
                    </label>
                    <Input
                      value={labUnit}
                      onChange={(event) => setLabUnit(event.target.value)}
                      placeholder="ng/mL"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Test date
                  </label>
                  <Input
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
                    placeholder="Optional context or anything your coach should keep in mind."
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
                    {labMessage ?? "These results appear on the PT medical tab."}
                  </span>
                </div>
              </SectionCard>
            </SurfaceCardContent>
          </SurfaceCard>

          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                <SurfaceCardTitle>Upload report</SurfaceCardTitle>
              </div>
              <SurfaceCardDescription>
                Upload a PDF, screenshot, or photo of a lab or medical report.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-4">
              <SectionCard className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Label
                    </label>
                    <Input
                      value={documentLabel}
                      onChange={(event) => setDocumentLabel(event.target.value)}
                      placeholder="Ex: Annual blood panel"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Report date
                    </label>
                    <Input
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
                  PDF and image files stay private and are shared only through
                  your coaching workspace.
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
              </SectionCard>
            </SurfaceCardContent>
          </SurfaceCard>
        </div>

        <div className="space-y-6">
          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <SurfaceCardTitle>History on file</SurfaceCardTitle>
              <SurfaceCardDescription>
                A timeline of medical context that your coach can reference.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-3">
              {recordsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
                  <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
                </div>
              ) : recordsQuery.error ? (
                <StatusBanner
                  variant="error"
                  title="Unable to load medical records"
                  description={getErrorMessage(recordsQuery.error)}
                />
              ) : historyEntries.length > 0 ? (
                historyEntries.map((entry) => (
                  <SectionCard key={entry.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {entry.title}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatShortDate(entry.observed_at)}
                      </span>
                    </div>
                    {entry.notes ? (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {entry.notes}
                      </p>
                    ) : null}
                  </SectionCard>
                ))
              ) : (
                <EmptyStateBlock
                  title="No medical history yet"
                  description="Add your relevant history here so your coach has the right context when planning training and nutrition."
                  icon={<HeartPulse className="h-5 w-5" />}
                />
              )}
            </SurfaceCardContent>
          </SurfaceCard>

          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <SurfaceCardTitle>Lab results</SurfaceCardTitle>
              <SurfaceCardDescription>
                Structured test values you have shared with your coach.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-3">
              {recordsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
                  <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
                </div>
              ) : recordsQuery.error ? (
                <StatusBanner
                  variant="error"
                  title="Unable to load lab results"
                  description={getErrorMessage(recordsQuery.error)}
                />
              ) : labEntries.length > 0 ? (
                labEntries.map((entry) => (
                  <SectionCard key={entry.id} className="space-y-3">
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
                        {formatShortDate(entry.observed_at)}
                      </span>
                    </div>
                    {entry.notes ? (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {entry.notes}
                      </p>
                    ) : null}
                  </SectionCard>
                ))
              ) : (
                <EmptyStateBlock
                  title="No lab values added yet"
                  description="Add structured results when you want your coach to review a specific test value quickly."
                  icon={<FlaskConical className="h-5 w-5" />}
                />
              )}
            </SurfaceCardContent>
          </SurfaceCard>

          <SurfaceCard>
            <SurfaceCardHeader className="pb-4">
              <SurfaceCardTitle>Uploaded reports</SurfaceCardTitle>
              <SurfaceCardDescription>
                Files you have shared inside the medical workspace.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-3">
              {documentsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
                  <Skeleton className="h-20 w-full rounded-[var(--radius-lg)]" />
                </div>
              ) : documentsQuery.error ? (
                <StatusBanner
                  variant="error"
                  title="Unable to load uploaded reports"
                  description={getErrorMessage(documentsQuery.error)}
                />
              ) : (documentsQuery.data ?? []).length > 0 ? (
                (documentsQuery.data ?? []).map((documentRow) => (
                  <SectionCard
                    key={documentRow.id}
                    className="flex flex-wrap items-center justify-between gap-3"
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
                  </SectionCard>
                ))
              ) : (
                <EmptyStateBlock
                  title="No uploaded reports yet"
                  description="Upload a PDF or report image here to make it available to your coach."
                  icon={<FileText className="h-5 w-5" />}
                />
              )}
            </SurfaceCardContent>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

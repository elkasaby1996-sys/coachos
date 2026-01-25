import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { supabase } from "../../lib/supabase";

export function NoWorkspacePage() {
  const [debugInfo, setDebugInfo] = useState<{
    userId: string | null;
    wmData: unknown;
    wmError: unknown;
    clientData: unknown;
    clientError: unknown;
  }>({
    userId: null,
    wmData: null,
    wmError: null,
    clientData: null,
    clientError: null,
  });

  useEffect(() => {
    let isMounted = true;

    const loadDebugInfo = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      let wmData: unknown = null;
      let wmError: unknown = null;
      let clientData: unknown = null;
      let clientError: unknown = null;

      if (userId) {
        const wmResult = await supabase
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", userId);
        wmData = wmResult.data;
        wmError = wmResult.error;

        const clientResult = await supabase.from("clients").select("id").eq("user_id", userId);
        clientData = clientResult.data;
        clientError = clientResult.error;
      }

      if (isMounted) {
        setDebugInfo({
          userId,
          wmData,
          wmError,
          clientData,
          clientError,
        });
      }
    };

    loadDebugInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
          <p className="text-sm text-muted-foreground">
            We couldn't match your account to a workspace. Please ask your coach for an invite.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="secondary">
            <Link to="/login">Back to login</Link>
          </Button>
          <Button asChild>
            <Link to="/join/sample">Use an invite code</Link>
          </Button>
          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Debug panel</p>
            <pre className="mt-2 whitespace-pre-wrap break-words">
              {JSON.stringify(debugInfo)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

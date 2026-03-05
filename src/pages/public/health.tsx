export function HealthPage() {
  const payload = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  return <>{JSON.stringify(payload)}</>;
}

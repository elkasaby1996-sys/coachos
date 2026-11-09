export function checkoutTransaction(search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get("_ptxn");
  return params.getAll("_ptxn").length === 1 &&
    /^txn_[a-z0-9]{26}$/.test(id ?? "")
    ? id
    : null;
}

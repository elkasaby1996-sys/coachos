import { Search } from "lucide-react";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";

export function ClientsFilters() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-64">
        <Input
          placeholder="Search clients..."
          className="h-9 rounded-full bg-secondary/40 pl-10"
        />
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <Button variant="secondary" size="sm">
        All Status
      </Button>
      <Button variant="secondary" size="sm">
        Sort by Name
      </Button>
    </div>
  );
}

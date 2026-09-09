import * as Avatar from "@radix-ui/react-avatar";
import { cn } from "../../lib/utils";

export function ProfileAvatar({
  name,
  src,
  className,
  fallback,
}: {
  name: string;
  src?: string | null;
  className?: string;
  fallback?: string;
}) {
  return (
    <Avatar.Root
      className={cn(
        "inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted text-sm text-muted-foreground",
        className,
      )}
    >
      <Avatar.Image
        src={src?.trim() || undefined}
        alt={`${name}'s profile photo`}
        className="h-full w-full object-cover"
      />
      <Avatar.Fallback
        className="flex h-full w-full items-center justify-center"
        aria-label={name}
      >
        {fallback || name.trim().charAt(0).toUpperCase() || "?"}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

// Message recipient RPCs return identity/access data; read photos under client RLS.
export function useClientAvatars(clientIds: string[]) {
  const { user } = useSessionAuth();
  const ids = [...new Set(clientIds)].sort();
  return useQuery({
    queryKey: ["client-avatars", user?.id, ids],
    enabled: Boolean(user?.id && ids.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, avatar_url, photo_url")
        .in("id", ids);
      if (error) throw error;
      return new Map(
        (data ?? []).map((client) => [
          client.id,
          client.avatar_url?.trim() || client.photo_url?.trim() || null,
        ]),
      );
    },
  });
}

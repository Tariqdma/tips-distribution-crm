import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export function useInvitationEmail() {
  const { session } = useSupabaseAuth();
  const mutation = trpc.crmInviteEmail.send.useMutation();
  const send = useCallback(async (inviteId: string) => {
    if (!session?.access_token) throw new Error("Supabase session is required");
    return mutation.mutateAsync({ inviteId, supabaseAccessToken: session.access_token });
  }, [mutation, session?.access_token]);
  return { send, isSending: mutation.isPending };
}

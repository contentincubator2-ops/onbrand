/**
 * assertMutation — guard against `(trpc as any).foo?.bar?.useMutation?.()`
 * returning undefined when the endpoint isn't on the deployed server.
 *
 * Usage:
 *   const mut = (trpc as any).brand?.updateConnections?.useMutation?.();
 *   const safeMut = useSafeMutation(mut, "brand.updateConnections");
 *   await safeMut.mutateAsync({...});  // throws clearly if undefined
 *
 * Toasts the user immediately when an undefined mutation is invoked —
 * was the silent-fail vector found in the 2026-05-08 audit.
 */
import { showToastGlobal } from "../components/ui/Toast";

interface MutationLike {
  mutate?: (...args: any[]) => any;
  mutateAsync?: (...args: any[]) => Promise<any>;
  isPending?: boolean;
  data?: any;
}

interface SafeMutation<TInput, TOutput> {
  mutate: (input?: TInput) => void;
  mutateAsync: (input?: TInput) => Promise<TOutput>;
  isPending: boolean;
  isAvailable: boolean;
}

export function useSafeMutation<TInput = any, TOutput = any>(
  mut: MutationLike | undefined | null,
  endpointName: string,
): SafeMutation<TInput, TOutput> {
  const isAvailable = !!(mut && (mut.mutate || mut.mutateAsync));

  return {
    isAvailable,
    isPending: !!mut?.isPending,
    mutate: (input?: TInput) => {
      if (!isAvailable) {
        const msg = `「${endpointName}」尚未部署或已下線，請聯絡開發團隊`;
        console.warn(`[useSafeMutation] missing endpoint: ${endpointName}`);
        showToastGlobal(msg, "error");
        return;
      }
      mut!.mutate!(input);
    },
    mutateAsync: async (input?: TInput): Promise<TOutput> => {
      if (!isAvailable) {
        const msg = `「${endpointName}」尚未部署或已下線，請聯絡開發團隊`;
        console.warn(`[useSafeMutation] missing endpoint: ${endpointName}`);
        showToastGlobal(msg, "error");
        throw new Error(msg);
      }
      return await mut!.mutateAsync!(input);
    },
  };
}

import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ServerFnCall<TIn, TOut> = (args: { data: TIn }) => Promise<TOut>;

interface UseAppMutationOptions<TIn, TOut> {
  invalidates?: QueryKey[];
  /** Shown via toast.success after the mutation succeeds. */
  successMessage?: string | ((data: TOut) => string);
  /** Fallback toast.error text when the error has no message. Pass false to disable the error toast. */
  errorMessage?: string | false;
  onSuccess?: (data: TOut, variables: TIn) => void;
  onError?: (error: Error, variables: TIn) => void;
  onSettled?: () => void;
}

// Standard mutation wrapper: call server fn → invalidate → toast.
// For optimistic updates (onMutate/rollback), use useMutation directly.
export function useAppMutation<TIn, TOut>(fn: ServerFnCall<TIn, TOut>, opts: UseAppMutationOptions<TIn, TOut> = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TIn) => fn({ data }),
    onSuccess: (data, variables) => {
      for (const key of opts.invalidates ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      if (opts.successMessage) {
        toast.success(typeof opts.successMessage === 'function' ? opts.successMessage(data) : opts.successMessage);
      }
      opts.onSuccess?.(data, variables);
    },
    onError: (error: Error, variables) => {
      if (opts.errorMessage !== false) {
        toast.error(error.message || (opts.errorMessage ?? 'Something went wrong'));
      }
      opts.onError?.(error, variables);
    },
    onSettled: opts.onSettled,
  });
}

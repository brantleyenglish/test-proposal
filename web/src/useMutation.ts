import { useState } from 'react';

import { apiRequest, getErrorMessage } from './api';
import { useCockpit } from './CockpitContext';

type MutationState = { isPending: boolean; error: string | null };

type MutateParams = { path: string; body?: unknown };

export const useMutation = <Result>() => {
  const { user, refresh } = useCockpit();
  const [mutation, setMutation] = useState<MutationState>({ isPending: false, error: null });

  const mutate = async ({ path, body }: MutateParams) => {
    setMutation({ isPending: true, error: null });
    try {
      const result = await apiRequest<Result>({ path, userId: user.id, method: 'POST', body });
      setMutation({ isPending: false, error: null });
      refresh();
      return result;
    } catch (error) {
      setMutation({ isPending: false, error: getErrorMessage(error) });
      return null;
    }
  };

  return { ...mutation, mutate };
};

import { useEffect, useState } from 'react';

import { apiRequest, getErrorMessage } from './api';
import { useCockpit } from './CockpitContext';

type ResourceState<Result> = { data: Result | null; error: string | null; isLoading: boolean };

export const useResource = <Result>(path: string | null) => {
  const { user, refreshToken } = useCockpit();
  const [resource, setResource] = useState<ResourceState<Result>>({ data: null, error: null, isLoading: true });

  useEffect(() => {
    const controller = { isCancelled: false };
    if (path) {
      setResource((current) => ({ ...current, isLoading: true }));
      apiRequest<Result>({ path, userId: user.id })
        .then((data) => {
          if (!controller.isCancelled) {
            setResource({ data, error: null, isLoading: false });
          }
        })
        .catch((error: unknown) => {
          if (!controller.isCancelled) {
            setResource({ data: null, error: getErrorMessage(error), isLoading: false });
          }
        });
    }
    return () => {
      controller.isCancelled = true;
    };
  }, [path, user.id, refreshToken]);

  return resource;
};

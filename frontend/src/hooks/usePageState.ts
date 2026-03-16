import { useState, useEffect, useCallback, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../store";
import { updateUiState, patchProjectUiState } from "../store/projectSlice";

/**
 * Hook to persist page-specific UI state to the backend project database.
 * Auto-saves with a debounce when state changes.
 * Survvies page reloads.
 * 
 * @param pageKey unique key for the page (e.g., 'atlas', 'clinical')
 * @param defaultState initial state if none exists in the DB
 */
export function usePageState<T extends Record<string, unknown>>(
  pageKey: string,
  defaultState: T
): [T, (newState: Partial<T> | ((prev: T) => Partial<T>)) => void] {
  const dispatch = useAppDispatch();
  const activeProject = useAppSelector((s) => s.project.activeProject);
  const projectId = activeProject?.id;
  
  // Get current state from Redux (or fallback to default)
  const savedState = activeProject?.ui_state?.[pageKey] as T | undefined;
  
  // Local state for immediate UI feedback
  const [localState, setLocalState] = useState<T>(() => ({
    ...defaultState,
    ...savedState,
  }));

  // Sync from Redux down to local on mount/change (if different)
  useEffect(() => {
    if (savedState && JSON.stringify(savedState) !== JSON.stringify(localState)) {
      setLocalState({ ...defaultState, ...savedState });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(savedState)]); 

  // Store timeout ID
  const timeoutRef = useRef<number | null>(null);

  // Debounced API call to save to backend
  const debouncedSave = useCallback((pid: string, pk: string, stateToSave: T) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      dispatch(patchProjectUiState({ projectId: pid, uiStateUpdates: { [pk]: stateToSave } }));
    }, 1500);
  }, [dispatch]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const setPageState = useCallback(
    (update: Partial<T> | ((prev: T) => Partial<T>)) => {
      setLocalState((prev) => {
        const nextPartial = typeof update === "function" ? update(prev) : update;
        const next = { ...prev, ...nextPartial };
        
        // Optimistically update Redux so it doesn't fight the local state
        dispatch(updateUiState({ [pageKey]: next }));
        
        // Debounce network save
        if (projectId) {
          debouncedSave(projectId, pageKey, next);
        }
        
        return next;
      });
    },
    [dispatch, pageKey, projectId, debouncedSave]
  );

  return [localState, setPageState];
}

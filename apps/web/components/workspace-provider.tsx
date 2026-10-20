"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  apiClient,
  ApiError,
  type Organization,
} from "../lib/api-client";
import { useAuth } from "./auth-provider";

type WorkspaceState = {
  ownerId: string | null;
  status: "loading" | "ready" | "error";
  organizations: Organization[];
  selectedOrganizationId: string | null;
  error: string | null;
};

type WorkspaceContextValue = WorkspaceState & {
  selectedOrganization: Organization | null;
  selectOrganization: (organizationId: string) => void;
  refresh: (selectId?: string) => Promise<Organization[]>;
  createOrganization: (name: string) => Promise<Organization>;
  clearSelection: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY_PREFIX = "nexora.workspace.selected.";

function getStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function getStoredSelection(userId: string): string | null {
  try {
    return window.localStorage.getItem(getStorageKey(userId));
  } catch {
    return null;
  }
}

function storeSelection(userId: string, organizationId: string) {
  try {
    window.localStorage.setItem(getStorageKey(userId), organizationId);
  } catch {
    // The server-returned membership list remains authoritative without storage.
  }
}

function removeStoredSelection(userId: string) {
  try {
    window.localStorage.removeItem(getStorageKey(userId));
  } catch {
    // Selection is also cleared from in-memory state.
  }
}

function removeAllStoredSelections() {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // No persisted selection is required for authorization or app operation.
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<WorkspaceState>({
    ownerId: null,
    status: "loading",
    organizations: [],
    selectedOrganizationId: null,
    error: null,
  });
  const requestId = useRef(0);
  const userId =
    auth.status === "authenticated" ? auth.user.id : null;

  const refresh = useCallback(
    async (selectId?: string): Promise<Organization[]> => {
      if (!userId) {
        return [];
      }
      const currentRequestId = ++requestId.current;
      setState((current) => ({
        ...current,
        ownerId: userId,
        status: "loading",
        error: null,
      }));

      try {
        const organizations = await apiClient.organizations();
        if (currentRequestId !== requestId.current) {
          return organizations;
        }

        const storedId =
          typeof window === "undefined" ? null : getStoredSelection(userId);
        const candidate = selectId ?? storedId;
        const selectedOrganizationId =
          candidate &&
          organizations.some((organization) => organization.id === candidate)
            ? candidate
            : (organizations[0]?.id ?? null);

        if (typeof window !== "undefined") {
          if (selectedOrganizationId)
            storeSelection(userId, selectedOrganizationId);
          else removeStoredSelection(userId);
        }

        setState({
          ownerId: userId,
          status: "ready",
          organizations,
          selectedOrganizationId,
          error: null,
        });
        return organizations;
      } catch (error) {
        if (currentRequestId !== requestId.current) {
          return [];
        }
        if (error instanceof ApiError && error.status === 401) {
          auth.setUser(null);
          return [];
        }
        setState((current) => ({
          ...current,
          ownerId: userId,
          status: "error",
          error:
            error instanceof ApiError
              ? error.message
              : "Unable to load workspaces. Please try again.",
        }));
        return [];
      }
    },
    [auth.setUser, userId],
  );

  const selectOrganization = useCallback(
    (organizationId: string) => {
      if (!userId) return;
      if (
        state.ownerId !== userId ||
        !state.organizations.some(
          (organization) => organization.id === organizationId,
        )
      ) {
        return;
      }
      storeSelection(userId, organizationId);
      setState((current) => {
        if (
          current.ownerId !== userId ||
          !current.organizations.some(
            (organization) => organization.id === organizationId,
          )
        ) {
          return current;
        }
        return { ...current, selectedOrganizationId: organizationId };
      });
    },
    [state.organizations, state.ownerId, userId],
  );

  const clearSelection = useCallback(() => {
    requestId.current += 1;
    if (userId && typeof window !== "undefined") {
      removeStoredSelection(userId);
    }
    setState({
      ownerId: null,
      status: "loading",
      organizations: [],
      selectedOrganizationId: null,
      error: null,
    });
  }, [userId]);

  const createOrganization = useCallback(
    async (name: string): Promise<Organization> => {
      if (!userId) {
        throw new ApiError(401, "Your session has expired. Please sign in again.");
      }
      let organization: Organization;
      try {
        organization = await apiClient.createOrganization({ name });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          auth.setUser(null);
        }
        throw error;
      }
      const organizations = await refresh(organization.id);
      if (!organizations.some((item) => item.id === organization.id)) {
        storeSelection(userId, organization.id);
        setState((current) => {
          const nextOrganizations = [
            organization,
            ...current.organizations.filter(
              (item) => item.id !== organization.id,
            ),
          ];
          return {
            ownerId: userId,
            status: "ready",
            organizations: nextOrganizations,
            selectedOrganizationId: organization.id,
            error: null,
          };
        });
      }
      return organization;
    },
    [auth.setUser, refresh, userId],
  );

  useEffect(() => {
    requestId.current += 1;
    if (!userId) {
      if (
        auth.status === "unauthenticated" &&
        typeof window !== "undefined"
      ) {
        removeAllStoredSelections();
      }
      setState({
        ownerId: null,
        status: "loading",
        organizations: [],
        selectedOrganizationId: null,
        error: null,
      });
      return;
    }

    setState({
      ownerId: userId,
      status: "loading",
      organizations: [],
      selectedOrganizationId: null,
      error: null,
    });
    void refresh();
  }, [auth.status, refresh, userId]);

  const currentState =
    state.ownerId === userId
      ? state
      : {
          ownerId: userId,
          status: "loading" as const,
          organizations: [],
          selectedOrganizationId: null,
          error: null,
        };
  const selectedOrganization =
    currentState.organizations.find(
      (organization) =>
        organization.id === currentState.selectedOrganizationId,
    ) ?? null;
  const value = useMemo(
    () => ({
      ...currentState,
      selectedOrganization,
      selectOrganization,
      refresh,
      createOrganization,
      clearSelection,
    }),
    [
      currentState,
      selectedOrganization,
      selectOrganization,
      refresh,
      createOrganization,
      clearSelection,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspaces must be used within WorkspaceProvider");
  }
  return value;
}

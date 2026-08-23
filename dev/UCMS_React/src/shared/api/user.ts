import { useEffect, useState } from "react";
import {
  API_UNAUTHORIZED_EVENT,
  ApiError,
  requestData,
} from "./http";

const SESSION_USER_KEY = "ucms.currentUser";
const CURRENT_USER_CHANGED_EVENT = "ucms:current-user-changed";
const USER_CACHE_TTL_MS = 30 * 60 * 1000;

export interface CurrentUser {
  id: number;
  userId: number | string;
  name: string;
  email: string | null;
  studentId: string | null;
  department: string | null;
  major: string | null;
  phone: string | null;
  role: string | null;
  authority: number;
  accountType: "human" | "system";
  systemKey: string | null;
  profileImage: string | null;
  thumbnailImage: string | null;
  joinedAt: string | null;
  impersonation: {
    active: true;
    actorName: string;
    targetName: string;
    readOnly: boolean;
    systemTestAccount: boolean;
    startedAt: string;
  } | null;
}

interface CurrentUserResponse {
  user: CurrentUser;
  cacheTtlSeconds: number;
}

interface CachedCurrentUser {
  expiresAt: number;
  user: CurrentUser;
}

let currentUserRequest: Promise<CurrentUser> | null = null;

export async function getCurrentUser() {
  if (currentUserRequest) {
    return currentUserRequest;
  }

  // 2026-07-23: sessionStorage is only an initial rendering cache; every mount revalidates the server session.
  currentUserRequest = requestData<CurrentUserResponse>("/api/user/me")
    .then((response) =>
      writeCurrentUser(response.user, response.cacheTtlSeconds),
    )
    .catch((error) => {
      if (isInvalidSessionError(error)) {
        clearCurrentUser();
      }
      throw error;
    })
    .finally(() => {
      currentUserRequest = null;
    });

  return currentUserRequest;
}

export async function logoutCurrentUser() {
  try {
    await requestData<{ message: string }>("/api/auth/logout", {
      method: "POST",
    });
  } finally {
    // 2026-07-23: A failed or already-expired logout request must not leave a stale name in the header.
    clearCurrentUser();
  }
}

export async function withdrawCurrentUser(reason: string) {
  await requestData<{ message: string }>("/api/user/me", {
    method: "DELETE",
    body: JSON.stringify({ reason })
  });
  clearCurrentUser();
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(() => readCachedCurrentUser());
  const [isLoading, setIsLoading] = useState(!user);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    // 2026-07-23: Synchronize every useCurrentUser consumer immediately after login/logout cache changes.
    function handleCurrentUserChange(event: Event) {
      if (!isMounted) return;
      const currentUserEvent = event as CustomEvent<CurrentUser | null>;
      setUser(currentUserEvent.detail);
      setError(null);
      setIsLoading(false);
    }

    function handleUnauthorized() {
      if (!isMounted) return;
      clearCurrentUser();
    }

    function revalidateCurrentUser() {
      if (!isMounted) return;
      getCurrentUser().catch((requestError: Error) => {
        if (!isMounted || isInvalidSessionError(requestError)) return;
        setError(requestError);
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        revalidateCurrentUser();
      }
    }

    window.addEventListener(CURRENT_USER_CHANGED_EVENT, handleCurrentUserChange);
    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    window.addEventListener("focus", revalidateCurrentUser);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    getCurrentUser()
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
          setError(null);
        }
      })
      .catch((requestError: Error) => {
        if (isMounted) {
          // 2026-07-23: A 401 from /api/user/me means a valid anonymous visit, not a UI error.
          if (isInvalidSessionError(requestError)) {
            clearCurrentUser();
            setUser(null);
            setError(null);
          } else {
            setError(requestError);
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      window.removeEventListener(CURRENT_USER_CHANGED_EVENT, handleCurrentUserChange);
      window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
      window.removeEventListener("focus", revalidateCurrentUser);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { user, isLoading, error };
}

export function writeCurrentUser(user: CurrentUser, ttlSeconds = USER_CACHE_TTL_MS / 1000) {
  const cachedUser: CachedCurrentUser = {
    expiresAt: Date.now() + ttlSeconds * 1000,
    user
  };

  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(cachedUser));
  notifyCurrentUserChanged(user);
  return user;
}

export function clearCurrentUser() {
  removeCurrentUserCache();
  notifyCurrentUserChanged(null);
}

function notifyCurrentUserChanged(user: CurrentUser | null) {
  window.dispatchEvent(
    new CustomEvent<CurrentUser | null>(CURRENT_USER_CHANGED_EVENT, { detail: user })
  );
}

function removeCurrentUserCache() {
  sessionStorage.removeItem(SESSION_USER_KEY);
}

function isInvalidSessionError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 404)
  );
}

// 2026-07-16: Current user must come from /api/user/me; keep only the
// contract-approved 30 minute sessionStorage cache and remove demo identity.
function readCachedCurrentUser() {
  const rawUser = sessionStorage.getItem(SESSION_USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const cachedUser = JSON.parse(rawUser) as CachedCurrentUser;

    if (!cachedUser.user || cachedUser.expiresAt <= Date.now()) {
      removeCurrentUserCache();
      return null;
    }

    return cachedUser.user;
  } catch {
    removeCurrentUserCache();
    return null;
  }
}

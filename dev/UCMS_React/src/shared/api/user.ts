import { useEffect, useState } from "react";
import { requestData } from "./http";

const SESSION_USER_KEY = "ucms.currentUser";
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
  profileImage: string | null;
  thumbnailImage: string | null;
  joinedAt: string | null;
}

interface CurrentUserResponse {
  user: CurrentUser;
  cacheTtlSeconds: number;
}

interface CachedCurrentUser {
  expiresAt: number;
  user: CurrentUser;
}

export async function getCurrentUser() {
  const cachedUser = readCachedCurrentUser();

  if (cachedUser) {
    return cachedUser;
  }

  const response = await requestData<CurrentUserResponse>("/api/user/me");
  return writeCurrentUser(response.user, response.cacheTtlSeconds);
}

export async function logoutCurrentUser() {
  await requestData<{ message: string }>("/api/auth/logout", {
    method: "POST"
  });
  clearCurrentUser();
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

    getCurrentUser()
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
          setError(null);
        }
      })
      .catch((requestError: Error) => {
        if (isMounted) {
          setError(requestError);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
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
  return user;
}

export function clearCurrentUser() {
  sessionStorage.removeItem(SESSION_USER_KEY);
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
      clearCurrentUser();
      return null;
    }

    return cachedUser.user;
  } catch {
    clearCurrentUser();
    return null;
  }
}

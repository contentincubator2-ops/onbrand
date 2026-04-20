/**
 * useAuth.ts — Authentication state management hook
 * Provides user authentication state, login, logout, and refresh functions.
 */

import { useState, useEffect, useCallback } from "react";

interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  isActive: number;
  credits: number;
  hasUnlimitedCredits: number;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

interface UseAuthOptions {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
}

export function useAuth(options: UseAuthOptions = {}) {
  const { redirectOnUnauthenticated = false, redirectPath = "/auth/login" } = options;

  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    isAuthenticated: false,
  });

  // Fetch current user
  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch("/api/auth/me", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setState({
            user: null,
            loading: false,
            error: null,
            isAuthenticated: false,
          });

          if (redirectOnUnauthenticated) {
            window.location.href = redirectPath;
          }
          return;
        }

        throw new Error("Failed to fetch user");
      }

      const data = await res.json() as { user: User };
      setState({
        user: data.user,
        loading: false,
        error: null,
        isAuthenticated: true,
      });
    } catch (err) {
      setState({
        user: null,
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
        isAuthenticated: false,
      });

      if (redirectOnUnauthenticated) {
        window.location.href = redirectPath;
      }
    }
  }, [redirectOnUnauthenticated, redirectPath]);

  // Logout
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout error:", err);
    }

    setState({
      user: null,
      loading: false,
      error: null,
      isAuthenticated: false,
    });

    window.location.href = "/auth/login";
  }, []);

  // Login with email/password
  const login = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as {
        success?: boolean;
        user?: User;
        error?: string | { email?: string[]; password?: string[] };
      };

      if (!res.ok || !data.success) {
        const errorMessage = typeof data.error === "string"
          ? data.error
          : "登入失敗，請檢查您的電子郵件和密碼";

        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));

        return { success: false, error: errorMessage };
      }

      setState({
        user: data.user!,
        loading: false,
        error: null,
        isAuthenticated: true,
      });

      return { success: true };
    } catch (err) {
      const errorMessage = "網路錯誤，請稍後再試";
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));

      return { success: false, error: errorMessage };
    }
  }, []);

  // Register new user
  const register = useCallback(async (name: string, email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json() as {
        success?: boolean;
        message?: string;
        error?: string | { name?: string[]; email?: string[]; password?: string[] };
      };

      if (!res.ok || !data.success) {
        const errorMessage = typeof data.error === "string"
          ? data.error
          : data.message || "註冊失敗，請稍後再試";

        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));

        return { success: false, error: errorMessage };
      }

      setState(prev => ({ ...prev, loading: false }));

      return { success: true, message: data.message };
    } catch (err) {
      const errorMessage = "網路錯誤，請稍後再試";
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));

      return { success: false, error: errorMessage };
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    isAuthenticated: state.isAuthenticated,
    refresh,
    logout,
    login,
    register,
  };
}

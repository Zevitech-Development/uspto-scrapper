"use client";

import { useState, useEffect, useCallback } from "react";
import {
  User,
  LoginCredentials,
  AuthContextType,
  ApiResponse,
} from "@/types/dashboard";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export const useAuth = (): AuthContextType => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = localStorage.getItem("auth_token");
        if (!storedToken) {
          setIsLoading(false);
          return;
        }

        // Validate token with backend
        const response = await fetch(`${API_BASE_URL}/auth/validate`, {
          headers: {
            Authorization: `Bearer ${storedToken}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data: ApiResponse<{ valid: boolean; user: any }> =
            await response.json();

          if (data.success && data.data?.valid) {
            setToken(storedToken);
            setUser(data.data.user);
            // Also set cookie for middleware
            document.cookie = `auth_token=${storedToken}; path=/; max-age=${
              7 * 24 * 60 * 60
            }; samesite=strict`;
          } else {
            // Token invalid, clear it
            localStorage.removeItem("auth_token");
            document.cookie =
              "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
          }
        } else {
          // Token invalid or expired
          localStorage.removeItem("auth_token");
          document.cookie =
            "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
        }
      } catch (error) {
        console.error("Auth initialization failed:", error);
        localStorage.removeItem("auth_token");
        document.cookie =
          "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      try {
        setIsLoading(true);

        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
        });

        const data: ApiResponse<{
          user: User;
          token: string;
          expiresIn: string;
        }> = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Login failed");
        }

        if (!data.success || !data.data) {
          throw new Error("Invalid response format");
        }

        const { user: userData, token: authToken } = data.data;

        // Store token in localStorage and cookie
        localStorage.setItem("auth_token", authToken);
        document.cookie = `auth_token=${authToken}; path=/; max-age=${
          7 * 24 * 60 * 60
        }; samesite=strict`;

        // Update state
        setToken(authToken);
        setUser(userData);
      } catch (error) {
        console.error("Login error:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      // Notify backend of logout (optional)
      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }).catch(() => {
          // Ignore logout API errors
        });
      }
    } finally {
      // Clear state regardless of API call result
      localStorage.removeItem("auth_token");
      document.cookie =
        "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const isAuthenticated = !!user && !!token;

  return {
    user,
    token,
    login,
    logout,
    isLoading,
    isAuthenticated,
  };
};

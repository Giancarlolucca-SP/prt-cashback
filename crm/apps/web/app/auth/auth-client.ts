"use client";

export type AuthUser = {
  id: string;
  storeId: string;
  storeName: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
};

export type AuthPermission = {
  module: string;
  action: string;
  scope: string;
  sensitiveArea: string | null;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
  permissions: AuthPermission[];
};

const tokenKey = "gt3-crm-auth-token";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";

export function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(tokenKey);
}

export function setStoredToken(token: string) {
  window.localStorage.setItem(tokenKey, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(tokenKey);
}

export async function login(email: string, password: string) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(response.status === 403 ? "Usuario inativo ou bloqueado." : "E-mail ou senha invalidos.");
  }

  return (await response.json()) as { token: string; user: AuthUser };
}

export async function fetchSession(token: string) {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Sessao invalida.");
  }

  const body = (await response.json()) as { user: AuthUser; permissions: AuthPermission[] };
  return {
    token,
    user: body.user,
    permissions: body.permissions,
  };
}

export async function apiGet<T>(path: string, token: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar os dados.");
  }

  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, token: string, body: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel salvar os dados.");
  }

  return (await response.json()) as T;
}

export async function apiPatch<T>(path: string, token: string, body: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel atualizar os dados.");
  }

  return (await response.json()) as T;
}

export async function apiPut<T>(path: string, token: string, body: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel salvar os dados.");
  }

  return (await response.json()) as T;
}

export async function apiDelete<T>(path: string, token: string, body?: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel remover os dados.");
  }

  return (await response.json()) as T;
}

export async function logout(token: string) {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

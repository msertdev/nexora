export type SafeUser = {
  id: string;
  email: string;
  name: string;
};

type AuthInput = {
  email: string;
  password: string;
};

type RegisterInput = AuthInput & {
  name: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:4000";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Unable to reach NEXORA. Check your connection and try again.");
  }

  if (!response.ok) {
    const messageByStatus: Record<number, string> = {
      400: "Check the information you entered and try again.",
      401: "Your session has expired. Please sign in again.",
      409: "An account with this email may already exist. Try signing in instead.",
      429: "Too many attempts. Please wait a moment and try again.",
      503: "Authentication is temporarily unavailable. Please try again.",
    };

    let serverMessage: unknown;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
      ) {
        serverMessage = body.message;
      }
    } catch {
      serverMessage = undefined;
    }

    const message =
      response.status === 401 && serverMessage === "Invalid email or password"
        ? "Email or password is incorrect."
        : response.status === 409 &&
            serverMessage === "Unable to register with these details"
          ? "An account with this email already exists. Try signing in instead."
          : messageByStatus[response.status] ??
            "Something went wrong. Please try again.";

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(0, "NEXORA returned an unexpected response.");
  }
}

export const apiClient = {
  login(input: AuthInput) {
    return request<SafeUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  register(input: RegisterInput) {
    return request<SafeUser>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  me() {
    return request<SafeUser>("/api/auth/me");
  },

  logout() {
    return request<void>("/api/auth/logout", { method: "POST" });
  },
};

export type SafeUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthenticatedRequest = {
  headers: {
    cookie?: string;
  };
  auth?: {
    sessionId: string;
    user: SafeUser;
  };
};

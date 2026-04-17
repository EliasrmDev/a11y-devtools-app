import { z } from "zod";

export const loginInputSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type RefreshInput = z.infer<typeof refreshInputSchema>;

export interface TokenPairOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
  };
}

export interface AuthConfigOutput {
  provider: string;
  loginUrl?: string;
}

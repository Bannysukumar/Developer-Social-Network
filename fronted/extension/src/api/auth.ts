import type { ApiClient } from "./client";
import { ApiError } from "./errors";
import { passwordProblem } from "../shared/password";
import {
  authResponseSchema,
  loginRequestSchema,
  signupRequestSchema,
  userProfileSchema,
  type AuthResponseDto,
  type LoginRequestDto,
  type SignupRequestDto,
  type UserProfileDto,
} from "../shared/api-types";

export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  login(input: LoginRequestDto): Promise<AuthResponseDto> {
    const body = loginRequestSchema.parse(input);
    return this.client.request("auth/login", authResponseSchema, {
      method: "POST",
      body,
      skipAuth: true,
    });
  }

  signup(input: SignupRequestDto): Promise<AuthResponseDto> {
    const body = signupRequestSchema.parse(input);
    const problem = passwordProblem(body.password);
    if (problem) throw new ApiError("request", problem);
    return this.client.request("auth/signup", authResponseSchema, {
      method: "POST",
      body,
      skipAuth: true,
    });
  }

  refresh(refreshToken: string): Promise<AuthResponseDto> {
    return this.client.request("auth/refresh", authResponseSchema, {
      method: "POST",
      body: { refreshToken },
      skipAuth: true,
    });
  }

  logout(refreshToken: string): Promise<unknown> {
    return this.client.request("auth/logout", undefined, {
      method: "POST",
      body: { refreshToken },
    });
  }

  me(): Promise<UserProfileDto> {
    return this.client.request("users/me", userProfileSchema, { method: "GET" });
  }

  forgotPassword(email: string): Promise<unknown> {
    return this.client.request("auth/forgot-password", undefined, {
      method: "POST",
      body: { email },
      skipAuth: true,
    });
  }

  resetPassword(token: string, newPassword: string): Promise<unknown> {
    const problem = passwordProblem(newPassword);
    if (problem) throw new ApiError("request", problem);
    return this.client.request("auth/reset-password", undefined, {
      method: "POST",
      body: { token, newPassword },
      skipAuth: true,
    });
  }

  changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
    const problem = passwordProblem(newPassword);
    if (problem) throw new ApiError("request", problem);
    return this.client.request("auth/change-password", undefined, {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  }

  resendVerification(): Promise<unknown> {
    return this.client.request("auth/resend-verification", undefined, { method: "POST" });
  }
}

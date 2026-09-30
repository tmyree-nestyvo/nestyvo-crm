import { SetMetadata } from '@nestjs/common';

// Marks the one route (POST /auth/change-password) that must stay reachable
// while a real, authenticated account is locked to "set a new password"
// mode by PasswordChangeGuard. Same pattern as @Public() for IS_PUBLIC_KEY.
export const ALLOW_PASSWORD_CHANGE_KEY = 'allowPasswordChange';
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

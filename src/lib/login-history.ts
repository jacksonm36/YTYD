/** Serializable login event shape (safe for API routes / client). */
export function serializeLoginEvent(event: {
  id: string;
  userId: string | null;
  loginId: string | null;
  success: boolean;
  ipAddress: string;
  userAgent: string | null;
  countryCode: string | null;
  countryName: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  createdAt: Date;
  user?: { username: string | null; email: string; name: string | null } | null;
}) {
  const locationParts = [
    event.city,
    event.region,
    event.countryName ?? event.countryCode,
  ].filter(Boolean);

  return {
    id: event.id,
    userId: event.userId,
    loginId: event.loginId,
    success: event.success,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    location: locationParts.length > 0 ? locationParts.join(", ") : null,
    countryCode: event.countryCode,
    timezone: event.timezone,
    createdAt: event.createdAt.toISOString(),
    userLabel: event.user
      ? event.user.username ?? event.user.name ?? event.user.email
      : null,
  };
}

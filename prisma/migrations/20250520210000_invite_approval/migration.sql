ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'approved';

CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "inviteToken" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteConfig_inviteToken_key" ON "SiteConfig"("inviteToken");

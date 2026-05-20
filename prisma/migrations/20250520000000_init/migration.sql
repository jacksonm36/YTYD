-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'hu',
    "termsAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "DownloadJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "formatId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'video',
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "fileSize" BIGINT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "DownloadJob_userId_status_idx" ON "DownloadJob"("userId", "status");

-- CreateIndex
CREATE INDEX "DownloadJob_expiresAt_idx" ON "DownloadJob"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitEvent_userId_action_createdAt_idx" ON "RateLimitEvent"("userId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitEvent_ipHash_action_createdAt_idx" ON "RateLimitEvent"("ipHash", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadJob" ADD CONSTRAINT "DownloadJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateLimitEvent" ADD CONSTRAINT "RateLimitEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

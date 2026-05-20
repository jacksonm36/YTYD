CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "loginId" TEXT,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "countryCode" TEXT,
    "countryName" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");
CREATE INDEX "LoginEvent_ipHash_createdAt_idx" ON "LoginEvent"("ipHash", "createdAt");

ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

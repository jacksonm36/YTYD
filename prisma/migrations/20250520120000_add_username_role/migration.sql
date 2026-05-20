-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

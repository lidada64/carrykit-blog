-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccessBucket" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ServiceNonce" (
    "nonce" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Visitor_expiresAt_idx" ON "Visitor"("expiresAt");

-- CreateIndex
CREATE INDEX "AccessBucket_expiresAt_idx" ON "AccessBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "ServiceNonce_expiresAt_idx" ON "ServiceNonce"("expiresAt");

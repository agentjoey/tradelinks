-- CreateTable
CREATE TABLE "OperationalAlertState" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "firstAlertedAt" TIMESTAMP(3) NOT NULL,
    "lastAlertedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "OperationalAlertState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAlertState_code_subjectId_key" ON "OperationalAlertState"("code", "subjectId");

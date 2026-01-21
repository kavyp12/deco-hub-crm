-- CreateTable
CREATE TABLE "SomfyCalculation" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SomfyCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SomfyCalculationItem" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "selectionItemId" TEXT NOT NULL,
    "trackType" TEXT NOT NULL DEFAULT 'Ripple',
    "trackDuty" TEXT NOT NULL DEFAULT 'Medium',
    "trackPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motorName" TEXT,
    "motorPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remoteName" TEXT,
    "remotePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rippleTapePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SomfyCalculationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SomfyCalculation_selectionId_key" ON "SomfyCalculation"("selectionId");

-- AddForeignKey
ALTER TABLE "SomfyCalculation" ADD CONSTRAINT "SomfyCalculation_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SomfyCalculationItem" ADD CONSTRAINT "SomfyCalculationItem_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "SomfyCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SomfyCalculationItem" ADD CONSTRAINT "SomfyCalculationItem_selectionItemId_fkey" FOREIGN KEY ("selectionItemId") REFERENCES "SelectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

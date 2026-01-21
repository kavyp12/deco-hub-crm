/*
  Warnings:

  - You are about to drop the column `product_category` on the `Inquiry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Inquiry" DROP COLUMN "product_category";

-- DropEnum
DROP TYPE "ProductCategory";

-- CreateTable
CREATE TABLE "Calculation" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationItem" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "selectionItemId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Standard',
    "type" TEXT NOT NULL DEFAULT 'Local',
    "panna" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "part" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sqft" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasBlackout" BOOLEAN NOT NULL DEFAULT false,
    "blackout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasSheer" BOOLEAN NOT NULL DEFAULT false,
    "sheer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightChain" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CalculationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalCalculation" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalCalculationItem" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "selectionItemId" TEXT NOT NULL,
    "panna" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fitting" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabricRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blackoutRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sheerRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channelRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labourRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fittingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasBlackout" BOOLEAN NOT NULL DEFAULT false,
    "blackout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasSheer" BOOLEAN NOT NULL DEFAULT false,
    "sheer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightChain" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "LocalCalculationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestCalculation" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForestCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestCalculationItem" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "selectionItemId" TEXT NOT NULL,
    "trackType" TEXT NOT NULL DEFAULT 'white',
    "trackPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "runnerType" TEXT NOT NULL DEFAULT 'FES BASE AND FLEX HOOK',
    "runnerPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tapeType" TEXT NOT NULL DEFAULT 'FLEX TAPE TRANSPARENT',
    "tapePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motorPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motorGst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remotePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBeforeGst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gst" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ForestCalculationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Calculation_selectionId_key" ON "Calculation"("selectionId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCalculation_selectionId_key" ON "LocalCalculation"("selectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ForestCalculation_selectionId_key" ON "ForestCalculation"("selectionId");

-- AddForeignKey
ALTER TABLE "SelectionItem" ADD CONSTRAINT "SelectionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calculation" ADD CONSTRAINT "Calculation_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationItem" ADD CONSTRAINT "CalculationItem_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationItem" ADD CONSTRAINT "CalculationItem_selectionItemId_fkey" FOREIGN KEY ("selectionItemId") REFERENCES "SelectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCalculation" ADD CONSTRAINT "LocalCalculation_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCalculationItem" ADD CONSTRAINT "LocalCalculationItem_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "LocalCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCalculationItem" ADD CONSTRAINT "LocalCalculationItem_selectionItemId_fkey" FOREIGN KEY ("selectionItemId") REFERENCES "SelectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForestCalculation" ADD CONSTRAINT "ForestCalculation_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForestCalculationItem" ADD CONSTRAINT "ForestCalculationItem_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "ForestCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForestCalculationItem" ADD CONSTRAINT "ForestCalculationItem_selectionItemId_fkey" FOREIGN KEY ("selectionItemId") REFERENCES "SelectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

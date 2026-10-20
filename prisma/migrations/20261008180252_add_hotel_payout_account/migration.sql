-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "payoutAccountLast4" TEXT,
ADD COLUMN     "payoutAccountName" TEXT,
ADD COLUMN     "payoutBankCode" TEXT,
ADD COLUMN     "payoutBankName" TEXT,
ADD COLUMN     "paystackSubaccountCode" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "processingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalCharged" DECIMAL(10,2) NOT NULL DEFAULT 0;

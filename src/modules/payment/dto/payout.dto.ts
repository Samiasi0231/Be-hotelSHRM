import { IsString, Matches } from 'class-validator';

export class SavePayoutAccountDto {
  @IsString()
  bankCode: string;

  @Matches(/^\d{10}$/, { message: 'Account number must be 10 digits' })
  accountNumber: string;
}
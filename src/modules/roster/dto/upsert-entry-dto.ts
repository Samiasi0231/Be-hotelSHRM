import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpsertRosterEntryDto {
  @IsString()
  staffId: string;

  @IsDateString()
  date: string;

  @IsOptional() @IsString()
  shiftTypeId?: string | null;

  @IsOptional() @IsString()
  note?: string;
}
import { IsString, IsDateString, IsOptional } from 'class-validator';

export class SetCellValueDto {
  @IsString()
  staffId: string;

  @IsString()
  columnId: string;

  @IsOptional() @IsString()
  value?: string;
}
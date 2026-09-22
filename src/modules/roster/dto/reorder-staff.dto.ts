import { IsArray, IsString } from 'class-validator';

export class ReorderStaffDto {
  @IsArray()
  @IsString({ each: true })
  staffIds: string[]; 
}
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreateRosterColumnDto {
  @IsString() @MaxLength(40)
  label: string;

  @IsOptional() @IsIn(['TEXT', 'NUMBER'])
  type?: 'TEXT' | 'NUMBER';
}
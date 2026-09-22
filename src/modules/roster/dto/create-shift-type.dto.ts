import { IsString, IsOptional, IsHexColor, MaxLength } from 'class-validator';

export class CreateShiftTypeDto {
  @IsString() @MaxLength(40)
  name: string;

  @IsString() @MaxLength(6)
  code: string;

  @IsOptional() @IsString()
  startTime?: string;

  @IsOptional() @IsString()
  endTime?: string;

  @IsOptional() @IsHexColor()
  color?: string;
}
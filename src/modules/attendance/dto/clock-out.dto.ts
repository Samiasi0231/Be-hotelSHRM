
import { IsString,IsOptional } from 'class-validator';
import { ClockInDto } from './clock-in.dto';
export class ClockOutDto extends ClockInDto {
  @IsOptional()
  @IsString()
  note?: string;
}
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiatePaymentDto {
  @ApiProperty() @IsString() bookingId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() callbackUrl?: string;
}

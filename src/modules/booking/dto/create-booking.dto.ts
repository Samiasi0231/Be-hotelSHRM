// src/modules/booking/dto/create-booking.dto.ts — FULL REPLACEMENT

import {
  IsString,
  IsEmail,
  IsOptional,
  IsInt,
  Min,
  IsDate,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  hotelId: string;

  @ApiProperty()
  @IsString()
  roomId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestId?: string;

  @ApiProperty()
  @IsString()
  guestName: string;

  @ApiProperty()
  @IsEmail()
  guestEmail: string;

  @ApiProperty()
  @IsString()
  guestPhone: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  checkIn: Date;

  @ApiProperty({ example: '2026-06-05T00:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  checkOut: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  adults?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialRequests?: string;

  /**
   * Optional: userId of staff member creating this booking.
   * Used for audit logging — automatically tracked from JWT if not provided.
   * Frontend should include this only if explicitly recording who created the booking.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdByUserId?: string;
}
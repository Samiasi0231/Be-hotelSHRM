import { IsString, IsNumber, IsOptional, IsInt, IsArray, IsEnum, Min,IsDate,IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RoomStatus } from '@prisma/client';

export class CreateRoomDto {
  @ApiProperty() @IsString() roomNumber: string;
  @ApiProperty() @IsString() roomType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) pricePerNight: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() floor?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() amenities?: string[];
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  @ApiPropertyOptional({ enum: RoomStatus }) @IsOptional() @IsEnum(RoomStatus) status?: RoomStatus;
}

export class CheckAvailabilityDto {
  @ApiPropertyOptional() @IsOptional() @IsString() hotelId?: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)   // 👈 converts incoming string → Date using class-transformer
  @IsDate()
  checkIn: Date;

  @ApiProperty({ example: '2026-06-05T00:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)   // 👈
  @IsDate()
  checkOut: Date;

  @ApiPropertyOptional() @IsOptional() @IsString() roomType?: string;
}

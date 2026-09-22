import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Gender } from '@prisma/client';

export class CreateInviteDto {
  // ── Personal details — director/admin fills these in upfront ─────────────
  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'jane@grandhotel.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.FEMALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  // ── Employment details ─────────────────────────────────────────────────────
  @ApiProperty({ enum: Role, example: Role.STAFF })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ example: 'Front Desk Agent' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: 'Front Office' })
  @IsOptional()
  @IsString()
  department?: string;

  // Leave blank to auto-generate (EMP-0001 style, scoped to the hotel)
  @ApiPropertyOptional({ example: 'EMP-0001' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;

  // Only honoured for SUPER_ADMIN callers — everyone else is scoped to
  // their own hotel automatically in the service.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hotelId?: string;
}
// src/modules/auth/dto/reset-password.dto.ts
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateResetTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ResetPasswordDto extends ValidateResetTokenDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignores everything after 72 bytes
  newPassword: string;
}
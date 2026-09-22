import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Everything except the password was already filled in by the director/admin
// when the invite was created — the staff member only sets their password.
export class AcceptInviteDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'Password@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
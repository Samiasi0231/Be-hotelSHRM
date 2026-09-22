import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'director@grandhotel.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Director@123' })
  @IsString()
  password: string;
}

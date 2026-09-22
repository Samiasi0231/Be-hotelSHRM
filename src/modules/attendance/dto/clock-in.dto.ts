import { IsString, IsLatitude, IsLongitude } from 'class-validator';

export class ClockInDto {
  @IsString()
  staffId: string;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;
}
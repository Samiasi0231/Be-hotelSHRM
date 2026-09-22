import { IsBoolean } from 'class-validator';

export class ToggleGeofenceDto {
  @IsBoolean()
  enabled: boolean;
}
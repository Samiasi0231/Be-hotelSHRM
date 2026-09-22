// src/modules/attendance/dto/set-attendance-location.dto.ts — FULL REPLACEMENT
import {
  IsLatitude, IsLongitude, IsInt, Min, Max,
  IsOptional, IsBoolean, IsIn, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class GeoPointDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}

export class SetAttendanceLocationDto {
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(2000)
  attendanceRadiusM?: number;

  @IsOptional()
  @IsBoolean()
  attendanceGeofenceEnabled?: boolean;

  @IsOptional()
  @IsIn(['CIRCLE', 'POLYGON'])
  attendanceGeofenceType?: 'CIRCLE' | 'POLYGON';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => GeoPointDto)
  attendanceGeofencePoints?: GeoPointDto[];
}
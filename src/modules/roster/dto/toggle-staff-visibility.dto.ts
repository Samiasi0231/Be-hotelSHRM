import { IsBoolean } from 'class-validator';

export class ToggleStaffVisibilityDto {
  @IsBoolean()
  hidden: boolean;
}
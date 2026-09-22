// src/modules/hotel/dto/onboarding.dto.ts

import { IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardingStepDto {
  @ApiProperty({ minimum: 2, maximum: 5, description: 'Which onboarding step to save' })
  @IsInt()
  @Min(2)
  @Max(5)
  step: number;

  @ApiPropertyOptional({ description: 'Step-specific payload' })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}
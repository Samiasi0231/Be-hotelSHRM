
import { IsArray, ValidateNested, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { UpsertRosterEntryDto } from './upsert-entry-dto';

export class BulkUpsertEntriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertRosterEntryDto)
  entries: UpsertRosterEntryDto[];
}
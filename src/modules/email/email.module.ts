// src/modules/email/email.module.ts

import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';

@Global()   // ← makes EmailService available everywhere without re-importing
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
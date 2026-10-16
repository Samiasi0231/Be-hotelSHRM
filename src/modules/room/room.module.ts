
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CloudinaryModule } from "../../cloudinary/clodinary.module";
import { memoryStorage } from 'multer';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
      CloudinaryModule,AuditLogModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, 
    }),

  ],
  
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
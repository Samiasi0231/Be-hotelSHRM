import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CloudinaryModule } from '@/cloudinary/clodinary.module';

@Module({
    imports: [
    CloudinaryModule, 
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService,PrismaService, ],
})
export class SuperAdminModule {}

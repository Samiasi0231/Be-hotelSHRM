// import { Module } from '@nestjs/common';
// import { RoomController } from './room.controller';
// import { RoomService } from './room.service';
// import { MulterModule } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { extname } from 'path';
// import { v4 as uuid } from 'uuid';

// @Module({
//   imports: [
//     MulterModule.register({
//       storage: diskStorage({
//         destination: './uploads/rooms',
//         filename: (_, file, cb) => cb(null, `${uuid()}${extname(file.originalname)}`),
//       }),
//     }),
//   ],
//   controllers: [RoomController],
//   providers: [RoomService],
//   exports: [RoomService],
// })
// export class RoomModule {}
// src/rooms/room.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CloudinaryModule } from "../../cloudinary/clodinary.module";
import { memoryStorage } from 'multer';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

@Module({
  imports: [
      CloudinaryModule,
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
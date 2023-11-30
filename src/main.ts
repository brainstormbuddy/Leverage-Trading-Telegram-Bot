import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cors from 'cors';
import 'dotenv/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cors());
  app.enableCors();
  await app.listen(process.env.PORT || 5000);
  // await app.listen(5000);
}
bootstrap();

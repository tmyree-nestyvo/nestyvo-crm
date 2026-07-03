import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  const allowedOrigins = [
    'http://localhost:8081',
    'http://localhost:19006',
    ...(process.env.APP_URL ? [process.env.APP_URL] : []),
  ];
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Nestyvo API running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();

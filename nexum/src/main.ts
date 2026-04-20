import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { helmetMiddleware } from './middleware/helmet.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Apply security headers
  app.use(helmetMiddleware);

  // Configure CORS based on environment
  const corsOrigins = configService.get<string>('CORS_ORIGINS');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  
  let allowedOrigins: (string | RegExp)[];
  
  if (corsOrigins) {
    // If CORS_ORIGINS is provided, use it
    allowedOrigins = corsOrigins.split(',').map((origin) => origin.trim());
  } else if (isProduction) {
    // In production, be more restrictive
    const frontendUrl = configService.get<string>('FRONTEND_URL');
    allowedOrigins = frontendUrl ? [frontendUrl] : [];
  } else {
    // In development, allow localhost with any port
    allowedOrigins = [
      'http://localhost:4200',
      'http://localhost:4300',
      'http://127.0.0.1:50535',
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ];
  }

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-company-id',
      'x-tenant-id'
    ],
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.listen(3001);
  console.log('NEXUM API running on http://localhost:3001');
}
bootstrap();

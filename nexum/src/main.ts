import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { helmetMiddleware } from './middleware/helmet.middleware';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
      'x-tenant-id',
    ],
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('NEXUM ERP API')
    .setDescription('Sistema ERP Multi-Tenant para Teneduria Garcia')
    .setVersion('1.0.0')
    .addTag('auth', 'Autenticación y gestión de usuarios')
    .addTag('companies', 'Gestión de empresas')
    .addTag('accounting', 'Módulo contable completo')
    .addTag('inventory', 'Gestión de inventario')
    .addTag('invoices', 'Facturación')
    .addTag('purchases', 'Compras')
    .addTag('fixed-assets', 'Activos fijos')
    .addTag('warehouses', 'Almacenes')
    .addTag('movements', 'Movimientos de inventario')
    .addTag('reports', 'Reportes financieros')
    .addTag('monitoring', 'Monitorización y salud del sistema')
    .addTag('csrf', 'Protección CSRF')
    .addBearerAuth()
    .addServer('http://localhost:3001', 'Development')
    .addServer('https://api.nexum.tg', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'NEXUM ERP API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: `
      .topbar-wrapper img { content: url('https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=NEXUM'); }
      .swagger-ui .topbar { background-color: #4F46E5; }
      .swagger-ui .topbar-wrapper .link { color: white; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
    },
  });

  await app.listen(3001);
  console.log('NEXUM API running on http://localhost:3001');
  console.log('Swagger docs available at http://localhost:3001/api/docs');
}
bootstrap();

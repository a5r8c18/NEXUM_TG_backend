import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  data?: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM') || 'noreply@nexum.cu';

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
      this.isConfigured = true;
      this.logger.log('Email service configured with SMTP');
    } else {
      this.logger.warn('Email service not configured - using console fallback');
    }
  }

  async sendEmail(
    options: EmailOptions,
  ): Promise<{ success: boolean; message: string }> {
    const from = this.configService.get<string>('SMTP_FROM') || 'noreply@nexum.cu';

    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          text: options.template,
          html: this.templateToHtml(options.template, options.data),
        });
        this.logger.log(`Email sent to ${options.to}`);
        return {
          success: true,
          message: 'Email enviado exitosamente',
        };
      } catch (error) {
        this.logger.error(`Failed to send email: ${error.message}`);
        return {
          success: false,
          message: `Error al enviar email: ${error.message}`,
        };
      }
    }

    // Fallback a consola si no está configurado
    console.log('📧 EMAIL SERVICE - Enviando email (fallback):');
    console.log('📬 Para:', options.to);
    console.log('📝 Asunto:', options.subject);
    console.log('📄 Plantilla:', options.template);
    console.log('📦 Datos:', options.data);

    return {
      success: true,
      message: 'Email enviado exitosamente (simulado)',
    };
  }

  private templateToHtml(template: string, data?: Record<string, any>): string {
    let html = template.replace(/\n/g, '<br>');
    if (data) {
      Object.keys(data).forEach(key => {
        html = html.replace(new RegExp(`{${key}}`, 'g'), data[key]);
      });
    }
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
          ${html}
        </div>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          Este email fue enviado automáticamente por NEXUM ERP.
        </p>
      </div>
    `;
  }

  async sendApprovalNotification(
    email: string,
    token: string,
    tenantType: string,
  ): Promise<{ success: boolean; message: string }> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const signupUrl = `${frontendUrl}/signup?token=${token}`;

    const template = `
      ¡Felicitaciones! Tu solicitud ha sido aprobada.

      Para completar tu registro, haz clic en el siguiente enlace:
      {signupUrl}

      Tipo de cuenta: {tenantType}

      Este enlace expirará en 7 días.

      Si no solicitaste este registro, ignora este email.
    `;

    return this.sendEmail({
      to: email,
      subject: '✅ Tu solicitud NEXUM ha sido aprobada',
      template,
      data: {
        signupUrl,
        tenantType: tenantType === 'MULTI_COMPANY' ? 'Multi-Empresa' : 'Empresa Individual',
      },
    });
  }
}

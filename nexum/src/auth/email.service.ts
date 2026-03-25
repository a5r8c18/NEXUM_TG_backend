/* eslint-disable @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common';

export interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  data?: Record<string, any>;
}

@Injectable()
export class EmailService {
  async sendEmail(
    options: EmailOptions,
  ): Promise<{ success: boolean; message: string }> {
    // Para desarrollo, solo mostramos el email en consola
    // En producción, aquí iría la integración con un servicio real como SendGrid, Nodemailer, etc.

    console.log('📧 EMAIL SERVICE - Enviando email:');
    console.log('📬 Para:', options.to);
    console.log('📝 Asunto:', options.subject);
    console.log('📄 Plantilla:', options.template);
    console.log('📦 Datos:', options.data);

    // Simulamos envío exitoso
    return {
      success: true,
      message: 'Email enviado exitosamente (simulado)',
    };
  }

  async sendApprovalNotification(
    email: string,
    token: string,
    tenantType: string,
  ): Promise<{ success: boolean; message: string }> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const signupUrl = `${frontendUrl}/signup?token=${token}`;

    const template = `
      ¡Felicitaciones! Tu solicitud ha sido aprobada.

      Para completar tu registro, haz clic en el siguiente enlace:
      ${signupUrl}

      Tipo de cuenta: ${tenantType === 'MULTI_COMPANY' ? 'Multi-Empresa' : 'Empresa Individual'}

      Este enlace expirará en 7 días.

      Si no solicitaste este registro, ignora este email.
    `;

    return this.sendEmail({
      to: email,
      subject: '✅ Tu solicitud NEXUM ha sido aprobada',
      template,
      data: { email, token, tenantType, signupUrl },
    });
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class PasswordPolicyService {
  private readonly MIN_LENGTH = 8;
  private readonly MAX_LENGTH = 128;
  private readonly REQUIRE_UPPERCASE = true;
  private readonly REQUIRE_LOWERCASE = true;
  private readonly REQUIRE_NUMBER = true;
  private readonly REQUIRE_SPECIAL = true;
  private readonly SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  validate(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password) {
      return { isValid: false, errors: ['La contraseña es requerida'] };
    }

    if (password.length < this.MIN_LENGTH) {
      errors.push(`La contraseña debe tener al menos ${this.MIN_LENGTH} caracteres`);
    }

    if (password.length > this.MAX_LENGTH) {
      errors.push(`La contraseña no puede exceder ${this.MAX_LENGTH} caracteres`);
    }

    if (this.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
      errors.push('La contraseña debe contener al menos una letra mayúscula');
    }

    if (this.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
      errors.push('La contraseña debe contener al menos una letra minúscula');
    }

    if (this.REQUIRE_NUMBER && !/\d/.test(password)) {
      errors.push('La contraseña debe contener al menos un número');
    }

    if (this.REQUIRE_SPECIAL && !new RegExp(`[${this.escapeRegex(this.SPECIAL_CHARS)}]`).test(password)) {
      errors.push(`La contraseña debe contener al menos un carácter especial: ${this.SPECIAL_CHARS}`);
    }

    // Prohibir contraseñas comunes
    const commonPasswords = [
      'password', '12345678', 'qwerty', 'abc123', 'password123',
      'admin123', 'letmein', 'welcome', 'monkey', 'dragon'
    ];
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('La contraseña es demasiado común. Por favor elija una más segura');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  validateOrThrow(password: string): void {
    const result = this.validate(password);
    if (!result.isValid) {
      throw new BadRequestException({
        message: 'La contraseña no cumple con la política de seguridad',
        errors: result.errors,
      });
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getPasswordPolicyDescription(): string {
    return `La contraseña debe cumplir con los siguientes requisitos:
- Mínimo ${this.MIN_LENGTH} caracteres
- Al menos una letra mayúscula
- Al menos una letra minúscula
- Al menos un número
- Al menos un carácter especial (${this.SPECIAL_CHARS})
- No puede ser una contraseña común`;
  }
}

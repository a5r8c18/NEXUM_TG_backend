import { SetMetadata } from '@nestjs/common';

export const CSRF_METADATA_KEY = 'csrf_disabled';

/**
 * Decorator to disable CSRF protection for a specific endpoint
 */
export const DisableCsrfProtection = () => SetMetadata(CSRF_METADATA_KEY, true);

export class CompanyResponseDto {
  id: number;
  name: string;
  tax_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_path?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  tenantId?: string;
  tenantType?: string;
}

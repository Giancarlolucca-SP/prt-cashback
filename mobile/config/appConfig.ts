/**
 * White-label configuration for PostoCash.
 *
 * Defaults are used on first load and as fallback when offline.
 * The live values are fetched from GET /app/config on app start
 * and merged over these defaults.
 *
 * To create a white-label build for a new network:
 * 1. Change the defaults here
 * 2. OR configure the establishment record in the backend
 *    (postoName, cashbackPercent, minRedemption, phone → supportWhatsApp)
 */

export interface AppConfig {
  /** Display name of the app */
  appName: string;
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Secondary / accent brand color (hex) */
  secondaryColor: string;
  /** Logo image URL (null = use emoji fallback ⛽) */
  logoUrl: string | null;
  /** Default cashback percentage shown in UI */
  cashbackPercent: number;
  /** Minimum redemption value in BRL */
  minRedemption: number;
  /** Gas station network name */
  postoName: string;
  /** WhatsApp support number (digits only, with country code e.g. 5511999999999) */
  supportWhatsApp: string;
  /** URL to terms of service */
  termsUrl: string;
  /** Establishment CNPJ (digits only) — used by reinstall flow */
  cnpj: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  appName:         'PostoCash',
  primaryColor:    '#1e3a5f',
  secondaryColor:  '#D97706',
  logoUrl:         null,
  cashbackPercent: 5,
  minRedemption:   10,
  postoName:       'Posto',
  supportWhatsApp: '',
  termsUrl:        '',
  cnpj:            '',
};

import { useAppConfig } from '../context/AppConfigContext';

export interface Branding {
  logoUrl:        string | null;
  primaryColor:   string;
  secondaryColor: string;
  appName:        string;
  tagline:        string;
  postoName:      string;
}

export function useBranding(): Branding {
  const { config } = useAppConfig();
  return {
    logoUrl:        config.logoUrl,
    primaryColor:   config.primaryColor,
    secondaryColor: config.secondaryColor,
    appName:        config.appName,
    tagline:        'Seu cashback inteligente',
    postoName:      config.postoName,
  };
}

export type IntegrationResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type StorageAdapter = {
  createSignedDownloadUrl(input: {
    bucket: string;
    path: string;
    expiresInSeconds: number;
  }): Promise<IntegrationResult<{ url: string; expiresAt: string }>>;
};

export type MessagingAdapter = {
  sendWhatsApp(input: { to: string; message: string }): Promise<IntegrationResult<{ providerMessageId: string }>>;
  sendEmail(input: { to: string; subject: string; html: string }): Promise<IntegrationResult<{ providerMessageId: string }>>;
};

export type AiAdapter = {
  summarize(input: { text: string; purpose: string }): Promise<IntegrationResult<{ summary: string }>>;
};

export const adapterContracts = {
  storage: "Supabase Storage",
  messaging: "Evolution API / SMTP",
  ai: "OpenAI or approved provider",
} as const;

export function createStorageAdapter(): StorageAdapter {
  return {
    async createSignedDownloadUrl(input) {
      const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
      const encodedPath = encodeURIComponent(input.path);

      return {
        ok: true,
        data: {
          url: `dev-storage://${input.bucket}/${encodedPath}?expiresAt=${encodeURIComponent(expiresAt)}`,
          expiresAt,
        },
      };
    },
  };
}

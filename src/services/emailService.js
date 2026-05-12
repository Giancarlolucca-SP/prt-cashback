const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendWelcomeEmail({ name, email, password, establishmentName }) {
  const { error } = await resend.emails.send({
    from: 'PostoCash <onboarding@resend.dev>',
    to: email,
    subject: '🎉 Bem-vindo ao PostoCash! Sua conta está ativa',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
        <img src="https://sistemapostocash.app/assets/logo-horizontal.svg" alt="PostoCash" style="height:40px;margin-bottom:32px;" />

        <h1 style="color:#1e293b;font-size:28px;margin-bottom:8px;">
          Bem-vindo ao PostoCash! 🎉
        </h1>
        <p style="color:#64748b;font-size:16px;margin-bottom:32px;">
          Sua conta foi criada com sucesso. Aqui estão suas credenciais de acesso:
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:32px;">
          <h2 style="color:#1e293b;font-size:16px;margin-bottom:16px;">📋 Suas credenciais</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:14px;">Estabelecimento</td>
              <td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">${establishmentName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:14px;">E-mail</td>
              <td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">${email}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:14px;">Senha</td>
              <td style="padding:8px 0;color:#FF6B00;font-size:20px;font-weight:800;letter-spacing:2px;">${password}</td>
            </tr>
          </table>
        </div>

        <a href="https://app.sistemapostocash.app/login"
           style="display:inline-block;background:#FF6B00;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;margin-bottom:32px;">
          Acessar meu painel →
        </a>

        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:32px;">
          <p style="color:#9a3412;font-size:13px;margin:0;">
            ⚠️ Guarde sua senha em local seguro. Você poderá alterá-la após o primeiro acesso.
          </p>
        </div>

        <h3 style="color:#1e293b;font-size:16px;margin-bottom:12px;">📱 Próximos passos:</h3>
        <ol style="color:#64748b;font-size:14px;line-height:2;">
          <li>Acesse o painel e configure seu cashback</li>
          <li>Imprima o QR Code e cole nas bombas</li>
          <li>Seus clientes já podem se cadastrar!</li>
        </ol>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;" />
        <p style="color:#94a3b8;font-size:12px;">
          PostoCash · Fidelidade inteligente para postos<br/>
          Dúvidas? <a href="https://wa.me/5511985498727" style="color:#FF6B00;">Fale conosco no WhatsApp</a>
        </p>
      </div>
    `,
  });

  if (error) throw new Error(error.message);

  console.log('[EMAIL] Boas-vindas enviado para:', email);
}

module.exports = { sendWelcomeEmail };

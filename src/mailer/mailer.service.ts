import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';

const TEMPLATES: Record<string, string> = {
  welcome: `
    <h2>Добро пожаловать в NG RENT!</h2>
    <p>{{userName}}, ваша организация <strong>{{tenantName}}</strong> успешно зарегистрирована.</p>
    <p>Войдите в систему и настройте первый объект недвижимости.</p>
  `,
  invoice: `
    <h2>Выставлен счёт №{{invoiceNumber}}</h2>
    <p>Сумма: <strong>{{amount}} ₽</strong></p>
    <p>Срок оплаты: {{dueDate}}</p>
    <p>Помещение: {{unitNumber}}, {{propertyName}}</p>
  `,
  'overdue-warning': `
    <h2>Просрочка оплаты</h2>
    <p>Счёт №{{invoiceNumber}} просрочен.</p>
    <p>Сумма: <strong>{{amount}} ₽</strong></p>
    <p>При дальнейшей задержке доступ в помещение будет ограничен.</p>
  `,
  'access-blocked': `
    <h2>Доступ ограничен</h2>
    <p>В связи с задолженностью по счёту №{{invoiceNumber}} карты СКУД заблокированы.</p>
    <p>Оплатите счёт для восстановления доступа.</p>
  `,
  'contract-ready': `
    <h2>Договор готов к подписанию</h2>
    <p>Договор №{{contractNumber}} сформирован и отправлен на подпись.</p>
    <p>Объект: {{propertyName}}, помещение №{{unitNumber}}</p>
  `,
  invite: `
    <h2>Приглашение в NG RENT</h2>
    <p>Вас пригласили в организацию <strong>{{tenantName}}</strong>.</p>
    <p>Перейдите по ссылке для регистрации:</p>
    <a href="{{inviteUrl}}">Принять приглашение</a>
  `,
  'reset-password': `
    <h2>Сброс пароля</h2>
    <p>Вы запросили сброс пароля. Перейдите по ссылке:</p>
    <a href="{{resetUrl}}">Сбросить пароль</a>
    <p>Ссылка действительна 1 час.</p>
  `,
  otp: `
    <h2>Код подтверждения</h2>
    <p>Ваш код: <strong style="font-size: 24px;">{{code}}</strong></p>
    <p>Код действителен 5 минут.</p>
  `,
};

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;
  private fromAddress: string;
  private compiledTemplates = new Map<string, Handlebars.TemplateDelegate>();

  constructor(private config: ConfigService) {
    this.fromAddress = this.config.get('SMTP_FROM', 'noreply@ngrent.ru');

    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 1025),
      secure: false,
      auth: this.config.get('SMTP_USER')
        ? {
            user: this.config.get('SMTP_USER'),
            pass: this.config.get('SMTP_PASS'),
          }
        : undefined,
    });

    for (const [name, html] of Object.entries(TEMPLATES)) {
      this.compiledTemplates.set(name, Handlebars.compile(html));
    }
  }

  /** Отправляет email по шаблону */
  async send(
    to: string,
    subject: string,
    template: string,
    data: Record<string, any>,
  ) {
    const compiled = this.compiledTemplates.get(template);
    if (!compiled) {
      this.logger.warn(`Шаблон "${template}" не найден, отправляем plain text`);
      return this.sendRaw(to, subject, JSON.stringify(data));
    }

    const html = this.wrapLayout(compiled(data));

    try {
      await this.transporter.sendMail({
        from: `"NG RENT" <${this.fromAddress}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email отправлен: ${to} — ${subject}`);
    } catch (err: any) {
      this.logger.error(`Ошибка отправки email: ${err.message}`);
    }
  }

  /** Отправляет email без шаблона */
  async sendRaw(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: `"NG RENT" <${this.fromAddress}>`,
        to,
        subject,
        html: this.wrapLayout(html),
      });
    } catch (err: any) {
      this.logger.error(`Ошибка отправки email: ${err.message}`);
    }
  }

  private wrapLayout(content: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="border-bottom: 2px solid #1890ff; padding-bottom: 10px; margin-bottom: 20px;">
        <h1 style="color: #1890ff; margin: 0;">NG RENT</h1>
      </div>
      ${content}
      <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 10px; color: #999; font-size: 12px;">
        <p>Это автоматическое уведомление от платформы NG RENT.</p>
      </div>
    </body>
    </html>`;
  }
}

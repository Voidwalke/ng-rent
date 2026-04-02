import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';

// Mock nodemailer before importing the module
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  }),
}));

describe('MailerService', () => {
  let service: MailerService;
  let mockTransporter: { sendMail: jest.Mock };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const values: Record<string, string> = {
        SMTP_FROM: 'test@ngrent.ru',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_TLS_REJECT_UNAUTHORIZED: 'false',
      };
      return values[key] ?? defaultValue ?? '';
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<MailerService>(MailerService);

    // Access private transporter for assertions
    mockTransporter = (service as any).transporter;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('send', () => {
    it('should compile template and call transporter with known template', async () => {
      await service.send('user@example.com', 'Welcome', 'welcome', {
        userName: 'John',
        tenantName: 'Acme Corp',
        verifyUrl: 'https://ngrent.ru/verify/123',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.subject).toBe('Welcome');
      expect(callArgs.html).toContain('John');
      expect(callArgs.html).toContain('Acme Corp');
      expect(callArgs.html).toContain('NG RENT');
    });

    it('should not crash with unknown template — sends raw JSON', async () => {
      await service.send('user@example.com', 'Test', 'nonexistent_template', {
        foo: 'bar',
      });

      // Should still call sendMail (via sendRaw fallback)
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.html).toContain('foo');
    });

    it('should compile invoice template with data variables', async () => {
      await service.send('tenant@example.com', 'Invoice', 'invoice', {
        invoiceNumber: 'INV-001',
        amount: '50000',
        dueDate: '01.04.2025',
        unitNumber: '101',
        propertyName: 'Бизнес-центр "Альфа"',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const html = mockTransporter.sendMail.mock.calls[0][0].html;
      expect(html).toContain('INV-001');
      expect(html).toContain('50000');
    });

    it('should throw error if transporter fails', async () => {
      mockTransporter.sendMail.mockRejectedValueOnce(
        new Error('SMTP connection refused'),
      );

      await expect(
        service.send('user@example.com', 'Test', 'welcome', {
          userName: 'Test',
          tenantName: 'Test',
          verifyUrl: 'http://test',
        }),
      ).rejects.toThrow('SMTP connection refused');
    });
  });
});

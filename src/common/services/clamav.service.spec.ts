import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClamavService } from './clamav.service';

describe('ClamavService', () => {
  const makeConfig = (enabled: string) => ({
    get: jest.fn((key: string, def?: any) => {
      const map: Record<string, any> = {
        CLAMAV_HOST: 'localhost',
        CLAMAV_PORT: 3310,
        CLAMAV_ENABLED: enabled,
      };
      return map[key] ?? def;
    }),
  });

  it('должен пропускать если disabled', async () => {
    const service = new ClamavService(makeConfig('false') as any);
    await expect(
      service.scan(Buffer.from('test'), 'file.txt'),
    ).resolves.toBeUndefined();
  });

  it('должен отклонить файл больше 25MB', async () => {
    const service = new ClamavService(makeConfig('true') as any);
    const bigBuffer = Buffer.alloc(26 * 1024 * 1024);
    await expect(service.scan(bigBuffer, 'huge.bin')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('должен бросить 503 если ClamAV недоступен (fail-closed)', async () => {
    const service = new ClamavService(makeConfig('true') as any);
    await expect(
      service.scan(Buffer.from('safe content'), 'doc.pdf'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

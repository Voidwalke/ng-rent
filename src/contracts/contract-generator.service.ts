import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';

/** Шаблон договора по умолчанию */
const DEFAULT_TEMPLATE = `
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 2cm; }
  h1 { text-align: center; font-size: 14pt; }
  .parties { margin-top: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td { padding: 5px; vertical-align: top; }
  .sign-line { border-top: 1px solid #000; margin-top: 40px; width: 250px; }
</style></head>
<body>
<h1>ДОГОВОР АРЕНДЫ НЕЖИЛОГО ПОМЕЩЕНИЯ №{{contract.contractNumber}}</h1>
<p style="text-align:center">г. Москва &nbsp;&nbsp;&nbsp;&nbsp; {{today}}</p>

<div class="parties">
<p><strong>{{tenant.name}}</strong>, ИНН {{tenant.inn}}, КПП {{tenant.kpp}},
юридический адрес: {{tenant.legalAddress}}, в лице уполномоченного представителя,
именуемое в дальнейшем «Арендодатель», с одной стороны, и</p>

<p><strong>{{client.companyName}}</strong>, ИНН {{client.inn}}, КПП {{client.kpp}},
юридический адрес: {{client.legalAddress}}, в лице {{client.contactName}},
именуемое в дальнейшем «Арендатор», с другой стороны,</p>

<p>заключили настоящий Договор о нижеследующем:</p>
</div>

<h3>1. ПРЕДМЕТ ДОГОВОРА</h3>
<p>1.1. Арендодатель передаёт, а Арендатор принимает во временное пользование нежилое помещение
№{{unit.unitNumber}}, расположенное по адресу: {{property.address}}, {{property.name}},
этаж {{unit.floor}}, площадью {{unit.areaSqm}} кв.м.</p>

<h3>2. СРОК АРЕНДЫ</h3>
<p>2.1. Срок аренды: с {{contract.startDate}} по {{contract.endDate}}.</p>

<h3>3. АРЕНДНАЯ ПЛАТА</h3>
<p>3.1. Ежемесячная арендная плата составляет {{contract.monthlyRent}} руб., в т.ч. НДС 20%.</p>
<p>3.2. Обеспечительный платёж: {{contract.depositAmount}} руб.</p>
<p>3.3. Оплата производится не позднее {{contract.paymentDay}}-го числа каждого месяца.</p>

<h3>4. ПОДПИСИ СТОРОН</h3>
<table>
<tr>
<td><strong>Арендодатель:</strong><br>{{tenant.name}}<br>ИНН {{tenant.inn}}<div class="sign-line">Подпись / М.П.</div></td>
<td><strong>Арендатор:</strong><br>{{client.companyName}}<br>ИНН {{client.inn}}<div class="sign-line">Подпись / М.П.</div></td>
</tr>
</table>
</body></html>
`;

@Injectable()
export class ContractGeneratorService {
  private readonly logger = new Logger(ContractGeneratorService.name);
  private template: Handlebars.TemplateDelegate;

  constructor() {
    this.template = Handlebars.compile(DEFAULT_TEMPLATE);
  }

  /** Генерирует HTML договора из данных */
  generateHtml(data: {
    tenant: any;
    client: any;
    property: any;
    unit: any;
    contract: any;
  }): string {
    const today = new Date().toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    return this.template({
      ...data,
      today,
      contract: {
        ...data.contract,
        startDate: new Date(data.contract.startDate).toLocaleDateString(
          'ru-RU',
        ),
        endDate: new Date(data.contract.endDate).toLocaleDateString('ru-RU'),
        monthlyRent: Number(data.contract.monthlyRent).toLocaleString('ru-RU'),
        depositAmount: Number(data.contract.depositAmount || 0).toLocaleString(
          'ru-RU',
        ),
      },
    });
  }

  /** Генерирует PDF (заглушка — в проде через Puppeteer) */
  async generatePdf(data: any): Promise<Buffer> {
    const html = this.generateHtml(data);
    // В проде: const browser = await puppeteer.launch(); page.setContent(html); page.pdf()
    this.logger.log(
      `PDF сгенерирован для договора ${data.contract.contractNumber}`,
    );
    return Buffer.from(html, 'utf-8');
  }
}

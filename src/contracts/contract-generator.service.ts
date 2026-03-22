import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import puppeteer, { Browser } from 'puppeteer';

const DEFAULT_TEMPLATE = `
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 0; padding: 0; }
  h1 { text-align: center; font-size: 14pt; margin-bottom: 5px; }
  h3 { margin-top: 18px; margin-bottom: 8px; font-size: 12pt; }
  p { margin: 4px 0; text-indent: 1.25cm; text-align: justify; }
  .no-indent { text-indent: 0; }
  .center { text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td { padding: 5px; vertical-align: top; }
  .sign-line { border-top: 1px solid #000; margin-top: 50px; width: 250px; text-align: center; font-size: 10pt; color: #666; }
  .requisites td { padding: 8px 10px; font-size: 11pt; }
  .page-break { page-break-before: always; }
</style></head>
<body>

<h1>ДОГОВОР АРЕНДЫ НЕЖИЛОГО ПОМЕЩЕНИЯ<br>№ {{contract.contractNumber}}</h1>
<p class="center no-indent">г. Москва &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {{today}}</p>

<p><strong>{{tenant.name}}</strong>, ИНН {{tenant.inn}}, КПП {{tenant.kpp}},
юридический адрес: {{tenant.legalAddress}}, в лице уполномоченного представителя,
действующего на основании Устава, именуемое в дальнейшем «Арендодатель», с одной стороны, и</p>

<p><strong>{{client.companyName}}</strong>, ИНН {{client.inn}}, КПП {{client.kpp}},
юридический адрес: {{client.legalAddress}}, в лице {{client.contactName}},
действующего на основании Устава, именуемое в дальнейшем «Арендатор», с другой стороны,</p>

<p>совместно именуемые «Стороны», а по отдельности — «Сторона», заключили настоящий Договор аренды нежилого помещения (далее — «Договор») о нижеследующем:</p>

<h3>1. ПРЕДМЕТ ДОГОВОРА</h3>
<p>1.1. Арендодатель обязуется предоставить Арендатору за плату во временное владение и пользование нежилое помещение № {{unit.unitNumber}}, расположенное по адресу: {{property.address}}, {{property.name}}, этаж {{unit.floor}}, общей площадью {{unit.areaSqm}} ({{unit.areaSqmWords}}) кв.м (далее — «Помещение»).</p>
<p>1.2. Помещение принадлежит Арендодателю на праве собственности, не обременено правами третьих лиц, не находится под арестом или запретом.</p>
<p>1.3. Помещение передаётся для использования в целях размещения офиса/производства/торговой деятельности Арендатора.</p>
<p>1.4. Передача Помещения осуществляется по акту приёма-передачи, являющемуся неотъемлемой частью настоящего Договора (Приложение № 1).</p>

<h3>2. СРОК АРЕНДЫ</h3>
<p>2.1. Настоящий Договор вступает в силу с момента его подписания обеими Сторонами и действует с {{contract.startDate}} по {{contract.endDate}}.</p>
<p>2.2. Если ни одна из Сторон не заявит о расторжении Договора не менее чем за 30 (тридцать) календарных дней до истечения срока его действия, Договор считается продлённым на каждый последующий календарный год на тех же условиях.</p>
<p>2.3. Арендатор, надлежащим образом исполнявший свои обязательства по настоящему Договору, имеет преимущественное право на заключение Договора аренды на новый срок (ст. 621 ГК РФ).</p>

<h3>3. АРЕНДНАЯ ПЛАТА И ПОРЯДОК РАСЧЁТОВ</h3>
<p>3.1. Ежемесячная арендная плата составляет {{contract.monthlyRent}} ({{contract.monthlyRentWords}}) рублей, в том числе НДС 20% — {{contract.vatAmount}} рублей.</p>
<p>3.2. Обеспечительный платёж (депозит) составляет {{contract.depositAmount}} ({{contract.depositWords}}) рублей и вносится Арендатором в течение 5 (пяти) рабочих дней с даты подписания Договора. Обеспечительный платёж возвращается Арендатору в течение 10 (десяти) рабочих дней после прекращения Договора за вычетом задолженности.</p>
<p>3.3. Арендная плата вносится ежемесячно не позднее {{contract.paymentDay}}-го числа текущего месяца путём безналичного перечисления на расчётный счёт Арендодателя.</p>
<p>3.4. Днём оплаты считается дата зачисления денежных средств на расчётный счёт Арендодателя.</p>
<p>3.5. Арендная плата включает расходы на содержание и текущий ремонт общего имущества здания. Коммунальные услуги (электроэнергия, водоснабжение, теплоснабжение) оплачиваются Арендатором отдельно на основании выставленных счётов.</p>
<p>3.6. Размер арендной платы может быть изменён по соглашению Сторон, но не чаще одного раза в год и не более чем на индекс потребительских цен за прошедший год.</p>

<h3>4. ПРАВА И ОБЯЗАННОСТИ АРЕНДОДАТЕЛЯ</h3>
<p>4.1. Арендодатель обязан:</p>
<p class="no-indent" style="margin-left: 1.25cm;">а) передать Помещение Арендатору по акту приёма-передачи в состоянии, пригодном для использования по назначению, в срок не позднее 5 (пяти) рабочих дней с даты подписания Договора;</p>
<p class="no-indent" style="margin-left: 1.25cm;">б) обеспечить беспрепятственный доступ Арендатора и его работников в Помещение, в том числе посредством системы контроля и управления доступом (СКУД);</p>
<p class="no-indent" style="margin-left: 1.25cm;">в) не препятствовать Арендатору в пользовании Помещением;</p>
<p class="no-indent" style="margin-left: 1.25cm;">г) производить капитальный ремонт Помещения;</p>
<p class="no-indent" style="margin-left: 1.25cm;">д) выдать Арендатору карты СКУД в количестве, согласованном Сторонами;</p>
<p class="no-indent" style="margin-left: 1.25cm;">е) уведомлять Арендатора о плановых отключениях инженерных систем не менее чем за 3 (три) рабочих дня.</p>
<p>4.2. Арендодатель вправе:</p>
<p class="no-indent" style="margin-left: 1.25cm;">а) осуществлять контроль за использованием Помещения по назначению;</p>
<p class="no-indent" style="margin-left: 1.25cm;">б) ограничить доступ в Помещение (блокировка карт СКУД) в случае просрочки оплаты более чем на 3 (три) календарных дня после направления письменного уведомления Арендатору.</p>

<h3>5. ПРАВА И ОБЯЗАННОСТИ АРЕНДАТОРА</h3>
<p>5.1. Арендатор обязан:</p>
<p class="no-indent" style="margin-left: 1.25cm;">а) своевременно и в полном объёме вносить арендную плату и иные платежи, предусмотренные Договором;</p>
<p class="no-indent" style="margin-left: 1.25cm;">б) использовать Помещение исключительно по целевому назначению, указанному в п. 1.3 Договора;</p>
<p class="no-indent" style="margin-left: 1.25cm;">в) содержать Помещение в надлежащем санитарном и техническом состоянии, осуществлять текущий ремонт за свой счёт;</p>
<p class="no-indent" style="margin-left: 1.25cm;">г) соблюдать правила пожарной безопасности и требования контролирующих органов;</p>
<p class="no-indent" style="margin-left: 1.25cm;">д) не производить перепланировку Помещения без письменного согласия Арендодателя;</p>
<p class="no-indent" style="margin-left: 1.25cm;">е) не передавать Помещение в субаренду без письменного согласия Арендодателя;</p>
<p class="no-indent" style="margin-left: 1.25cm;">ж) по окончании срока аренды вернуть Помещение по акту приёма-передачи в состоянии не хуже первоначального с учётом нормального износа;</p>
<p class="no-indent" style="margin-left: 1.25cm;">з) бережно относиться к картам СКУД, незамедлительно уведомлять Арендодателя об утере или повреждении карт.</p>
<p>5.2. Арендатор вправе:</p>
<p class="no-indent" style="margin-left: 1.25cm;">а) требовать от Арендодателя устранения недостатков Помещения, препятствующих его использованию;</p>
<p class="no-indent" style="margin-left: 1.25cm;">б) с согласия Арендодателя производить неотделимые улучшения Помещения с правом на возмещение их стоимости.</p>

<h3>6. ОТВЕТСТВЕННОСТЬ СТОРОН</h3>
<p>6.1. За нарушение сроков оплаты арендной платы Арендатор уплачивает Арендодателю неустойку в размере 0,1% (ноль целых одна десятая процента) от суммы задолженности за каждый день просрочки, но не более 10% от суммы задолженности.</p>
<p>6.2. За нарушение сроков передачи Помещения Арендодатель уплачивает Арендатору неустойку в размере 0,1% от ежемесячной арендной платы за каждый день просрочки.</p>
<p>6.3. Уплата неустойки не освобождает Стороны от исполнения обязательств по Договору.</p>
<p>6.4. Стороны несут ответственность за ущерб, причинённый имуществу другой Стороны, в соответствии с действующим законодательством Российской Федерации.</p>

<h3>7. ПОРЯДОК ИЗМЕНЕНИЯ И РАСТОРЖЕНИЯ ДОГОВОРА</h3>
<p>7.1. Настоящий Договор может быть изменён или расторгнут по соглашению Сторон, оформленному в письменном виде.</p>
<p>7.2. Каждая из Сторон вправе досрочно расторгнуть Договор, предупредив другую Сторону в письменной форме не менее чем за 60 (шестьдесят) календарных дней.</p>
<p>7.3. Арендодатель вправе потребовать досрочного расторжения Договора в случаях:</p>
<p class="no-indent" style="margin-left: 1.25cm;">а) использования Помещения не по назначению;</p>
<p class="no-indent" style="margin-left: 1.25cm;">б) существенного ухудшения состояния Помещения;</p>
<p class="no-indent" style="margin-left: 1.25cm;">в) просрочки оплаты арендной платы более чем за два месяца подряд;</p>
<p class="no-indent" style="margin-left: 1.25cm;">г) передачи Помещения в субаренду без согласия Арендодателя.</p>
<p>7.4. Арендатор вправе потребовать досрочного расторжения Договора в случаях:</p>
<p class="no-indent" style="margin-left: 1.25cm;">а) непредоставления Помещения в установленный срок;</p>
<p class="no-indent" style="margin-left: 1.25cm;">б) создания Арендодателем препятствий в пользовании Помещением;</p>
<p class="no-indent" style="margin-left: 1.25cm;">в) обнаружения недостатков, препятствующих использованию Помещения.</p>

<h3>8. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ</h3>
<p>8.1. Стороны освобождаются от ответственности за неисполнение или ненадлежащее исполнение обязательств по Договору, если это явилось следствием обстоятельств непреодолимой силы (форс-мажор): стихийные бедствия, пожар, наводнение, землетрясение, эпидемии, военные действия, забастовки, принятие органами государственной власти актов, препятствующих исполнению обязательств.</p>
<p>8.2. Сторона, подвергшаяся действию форс-мажора, обязана уведомить другую Сторону в течение 5 (пяти) рабочих дней с момента наступления таких обстоятельств.</p>
<p>8.3. Если обстоятельства непреодолимой силы длятся более 3 (трёх) месяцев, каждая из Сторон вправе отказаться от исполнения Договора без возмещения убытков.</p>

<h3>9. КОНФИДЕНЦИАЛЬНОСТЬ</h3>
<p>9.1. Стороны обязуются не разглашать третьим лицам конфиденциальную информацию, полученную в ходе исполнения Договора, включая коммерческие условия, финансовые данные и персональные данные.</p>
<p>9.2. Обязательства по конфиденциальности сохраняют силу в течение 3 (трёх) лет после прекращения Договора.</p>

<h3>10. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ</h3>
<p>10.1. Все споры и разногласия, возникающие между Сторонами в связи с исполнением Договора, разрешаются путём переговоров.</p>
<p>10.2. В случае невозможности разрешения споров путём переговоров в течение 30 (тридцати) календарных дней Стороны передают их на рассмотрение в Арбитражный суд г. Москвы.</p>
<p>10.3. До обращения в суд Сторона, права которой нарушены, направляет другой Стороне письменную претензию. Срок рассмотрения претензии — 15 (пятнадцать) рабочих дней.</p>

<h3>11. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ</h3>
<p>11.1. Настоящий Договор составлен в двух экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон.</p>
<p>11.2. Все приложения и дополнительные соглашения к Договору являются его неотъемлемой частью.</p>
<p>11.3. Во всём, что не предусмотрено настоящим Договором, Стороны руководствуются действующим законодательством Российской Федерации, в том числе главой 34 Гражданского кодекса РФ.</p>
<p>11.4. Любые изменения и дополнения к настоящему Договору действительны при условии их оформления в письменном виде и подписания обеими Сторонами.</p>

<div class="page-break"></div>

<h3>12. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</h3>
<table class="requisites">
<tr>
<td style="width:50%; border-right: 1px solid #ccc;">
  <strong>Арендодатель:</strong><br><br>
  {{tenant.name}}<br>
  ИНН {{tenant.inn}} / КПП {{tenant.kpp}}<br>
  {{tenant.legalAddress}}<br>
  {{#if tenant.bankName}}р/с {{tenant.bankAccount}}<br>
  в {{tenant.bankName}}<br>
  БИК {{tenant.bik}}<br>
  к/с {{tenant.corrAccount}}{{/if}}<br><br>
  <div class="sign-line">Подпись / М.П.</div>
</td>
<td style="width:50%;">
  <strong>Арендатор:</strong><br><br>
  {{client.companyName}}<br>
  ИНН {{client.inn}} / КПП {{client.kpp}}<br>
  {{client.legalAddress}}<br>
  {{#if client.bankName}}р/с {{client.bankAccount}}<br>
  в {{client.bankName}}<br>
  БИК {{client.bik}}<br>
  к/с {{client.corrAccount}}{{/if}}<br><br>
  <div class="sign-line">Подпись / М.П.</div>
</td>
</tr>
</table>

</body></html>
`;

@Injectable()
export class ContractGeneratorService implements OnModuleDestroy {
  private readonly logger = new Logger(ContractGeneratorService.name);
  private template: Handlebars.TemplateDelegate;
  private browser: Browser | null = null;

  constructor() {
    this.template = Handlebars.compile(DEFAULT_TEMPLATE);
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
    }
    return this.browser;
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

    const monthlyRent = Number(data.contract.monthlyRent);
    const vatAmount = Math.round(monthlyRent * 0.2 * 100) / 100;
    const depositAmount = Number(data.contract.depositAmount || 0);

    return this.template({
      ...data,
      today,
      unit: {
        ...data.unit,
        areaSqmWords: this.numberToWords(Number(data.unit.areaSqm)),
      },
      contract: {
        ...data.contract,
        startDate: new Date(data.contract.startDate).toLocaleDateString(
          'ru-RU',
        ),
        endDate: new Date(data.contract.endDate).toLocaleDateString('ru-RU'),
        monthlyRent: monthlyRent.toLocaleString('ru-RU'),
        monthlyRentWords: this.numberToWords(monthlyRent),
        vatAmount: vatAmount.toLocaleString('ru-RU'),
        depositAmount: depositAmount.toLocaleString('ru-RU'),
        depositWords: this.numberToWords(depositAmount),
      },
    });
  }

  /** Переводит число в текст прописью (упрощённо, целая часть) */
  private numberToWords(n: number): string {
    if (n === 0) return 'ноль';
    const units = [
      '',
      'один',
      'два',
      'три',
      'четыре',
      'пять',
      'шесть',
      'семь',
      'восемь',
      'девять',
    ];
    const teens = [
      'десять',
      'одиннадцать',
      'двенадцать',
      'тринадцать',
      'четырнадцать',
      'пятнадцать',
      'шестнадцать',
      'семнадцать',
      'восемнадцать',
      'девятнадцать',
    ];
    const tens = [
      '',
      '',
      'двадцать',
      'тридцать',
      'сорок',
      'пятьдесят',
      'шестьдесят',
      'семьдесят',
      'восемьдесят',
      'девяносто',
    ];
    const hundreds = [
      '',
      'сто',
      'двести',
      'триста',
      'четыреста',
      'пятьсот',
      'шестьсот',
      'семьсот',
      'восемьсот',
      'девятьсот',
    ];

    const num = Math.floor(Math.abs(n));
    if (num >= 1_000_000) return num.toLocaleString('ru-RU');

    const parts: string[] = [];
    const th = Math.floor(num / 1000);
    const rem = num % 1000;

    if (th > 0) {
      const thH = Math.floor(th / 100);
      const thT = Math.floor((th % 100) / 10);
      const thU = th % 10;
      if (thH) parts.push(hundreds[thH]);
      if (thT === 1) {
        parts.push(teens[(th % 100) - 10]);
      } else {
        if (thT) parts.push(tens[thT]);
        if (thU)
          parts.push(thU === 1 ? 'одна' : thU === 2 ? 'две' : units[thU]);
      }
      parts.push(
        th % 100 >= 11 && th % 100 <= 19
          ? 'тысяч'
          : thU === 1
            ? 'тысяча'
            : thU >= 2 && thU <= 4
              ? 'тысячи'
              : 'тысяч',
      );
    }

    const rH = Math.floor(rem / 100);
    const rT = Math.floor((rem % 100) / 10);
    const rU = rem % 10;
    if (rH) parts.push(hundreds[rH]);
    if (rT === 1) {
      parts.push(teens[(rem % 100) - 10]);
    } else {
      if (rT) parts.push(tens[rT]);
      if (rU) parts.push(units[rU]);
    }

    return parts.join(' ');
  }

  /** Генерирует PDF договора через Puppeteer */
  async generatePdf(data: any): Promise<Buffer> {
    const html = this.generateHtml(data);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '25mm' },
        printBackground: true,
      });

      this.logger.log(
        `PDF сгенерирован: договор ${data.contract.contractNumber}`,
      );
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }
}

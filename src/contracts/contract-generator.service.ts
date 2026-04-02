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

<p><strong>{{tenant.name}}</strong>, ИНН {{tenant.inn}}, КПП {{tenant.kpp}}{{#if tenant.ogrn}}, ОГРН {{tenant.ogrn}}{{/if}},
юридический адрес: {{tenant.legalAddress}}, в лице уполномоченного представителя,
действующего на основании Устава, именуемое в дальнейшем «Арендодатель», с одной стороны, и</p>

<p><strong>{{client.companyName}}</strong>, ИНН {{client.inn}}{{#if client.kpp}}, КПП {{client.kpp}}{{/if}},
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
  {{#if tenant.ogrn}}ОГРН {{tenant.ogrn}}<br>{{/if}}
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
  ИНН {{client.inn}}{{#if client.kpp}} / КПП {{client.kpp}}{{/if}}<br>
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

const HANDOVER_ACT_TEMPLATE = `
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 0; padding: 0; }
  h1 { text-align: center; font-size: 14pt; margin-bottom: 5px; }
  p { margin: 4px 0; text-indent: 1.25cm; text-align: justify; }
  .no-indent { text-indent: 0; }
  .center { text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td { padding: 5px; vertical-align: top; }
  .sign-line { border-top: 1px solid #000; margin-top: 50px; width: 250px; text-align: center; font-size: 10pt; color: #666; }
</style></head>
<body>
<h1>АКТ ПРИЁМА-ПЕРЕДАЧИ НЕЖИЛОГО ПОМЕЩЕНИЯ</h1>
<p class="center no-indent">Приложение № 1 к Договору аренды № {{contract.contractNumber}}</p>
<p class="center no-indent">г. Москва &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {{today}}</p>

<p><strong>{{tenant.name}}</strong>, именуемое в дальнейшем «Арендодатель», в лице уполномоченного представителя, с одной стороны, и</p>
<p><strong>{{client.companyName}}</strong>, именуемое в дальнейшем «Арендатор», в лице {{client.contactName}}, с другой стороны,</p>
<p>составили настоящий Акт о нижеследующем:</p>

<p>1. Арендодатель передаёт, а Арендатор принимает во временное владение и пользование нежилое помещение № {{unit.unitNumber}}, расположенное по адресу: {{property.address}}, {{property.name}}, этаж {{unit.floor}}, общей площадью {{unit.areaSqm}} кв.м.</p>

<p>2. Техническое состояние Помещения:</p>
<p class="no-indent" style="margin-left: 1.25cm;">— стены: удовлетворительное состояние;</p>
<p class="no-indent" style="margin-left: 1.25cm;">— полы: удовлетворительное состояние;</p>
<p class="no-indent" style="margin-left: 1.25cm;">— окна: удовлетворительное состояние;</p>
<p class="no-indent" style="margin-left: 1.25cm;">— электроснабжение: исправно;</p>
<p class="no-indent" style="margin-left: 1.25cm;">— сантехника: исправна;</p>
<p class="no-indent" style="margin-left: 1.25cm;">— пожарная сигнализация: исправна.</p>

<p>3. Показания приборов учёта на момент передачи:</p>
<p class="no-indent" style="margin-left: 1.25cm;">— электроэнергия: __________ кВт·ч;</p>
<p class="no-indent" style="margin-left: 1.25cm;">— водоснабжение: __________ м³.</p>

<p>4. Помещение передаётся со следующими ключами и картами доступа:</p>
<p class="no-indent" style="margin-left: 1.25cm;">— ключи: _______ шт.;</p>
<p class="no-indent" style="margin-left: 1.25cm;">— карты СКУД: _______ шт.</p>

<p>5. Арендатор претензий к техническому состоянию Помещения не имеет / имеет следующие замечания: ___________________________________________________________________________</p>

<p>6. Настоящий Акт составлен в двух экземплярах, по одному для каждой из Сторон.</p>

<table>
<tr>
<td style="width:50%;"><strong>Арендодатель:</strong><br><br>_____________________ / ФИО<br><br>{{tenant.name}}<div class="sign-line">Подпись / М.П.</div></td>
<td style="width:50%;"><strong>Арендатор:</strong><br><br>_____________________ / {{client.contactName}}<br><br>{{client.companyName}}<div class="sign-line">Подпись / М.П.</div></td>
</tr>
</table>
</body></html>
`;

const INVOICE_DOCUMENT_TEMPLATE = `
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; font-size: 10pt; margin: 0; padding: 0; }
  h1 { text-align: center; font-size: 14pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  .no-border td { border: none; }
  .right { text-align: right; }
  .header-table td { border: none; padding: 2px 4px; font-size: 9pt; }
</style></head>
<body>

<table class="header-table" style="margin-bottom: 10px;">
<tr><td colspan="2" style="border-bottom: 2px solid #000; font-size: 10pt;">
  {{tenant.bankName}}<br>
  БИК {{tenant.bik}} &nbsp;&nbsp; К/с {{tenant.corrAccount}}
</td></tr>
<tr><td>Банк получателя</td><td></td></tr>
<tr><td>ИНН {{tenant.inn}}</td><td>КПП {{tenant.kpp}}</td></tr>
<tr><td colspan="2">Получатель: {{tenant.name}}{{#if tenant.ogrn}} (ОГРН {{tenant.ogrn}}){{/if}}</td></tr>
<tr><td colspan="2" style="border-bottom: 1px solid #000;">Р/с {{tenant.bankAccount}}</td></tr>
</table>

<h1>Счёт на оплату № {{invoice.number}}<br>от {{invoice.date}}</h1>

<table class="no-border" style="margin-bottom: 16px;">
<tr><td><strong>Поставщик:</strong> {{tenant.name}}, ИНН {{tenant.inn}}, КПП {{tenant.kpp}}{{#if tenant.ogrn}}, ОГРН {{tenant.ogrn}}{{/if}}, {{tenant.legalAddress}}</td></tr>
<tr><td><strong>Покупатель:</strong> {{client.companyName}}, ИНН {{client.inn}}{{#if client.kpp}}, КПП {{client.kpp}}{{/if}}, {{client.legalAddress}}</td></tr>
</table>

<table>
<tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th></tr>
<tr>
  <td>1</td>
  <td>Аренда нежилого помещения № {{unit.unitNumber}}, {{property.name}}, за период {{invoice.periodStart}} — {{invoice.periodEnd}}</td>
  <td>1</td>
  <td>мес.</td>
  <td class="right">{{invoice.amount}}</td>
  <td class="right">{{invoice.amount}}</td>
</tr>
</table>

<p style="margin-top: 8px;"><strong>Итого:</strong> {{invoice.amount}} руб.</p>
{{#if invoice.vatAmount}}<p><strong>В т.ч. НДС ({{invoice.vatPercent}}%):</strong> {{invoice.vatAmount}} руб.</p>{{/if}}
{{#unless invoice.vatAmount}}<p><strong>Без НДС</strong></p>{{/unless}}
<p><strong>Всего к оплате:</strong> {{invoice.totalAmount}} руб. ({{invoice.totalWords}})</p>

<p style="margin-top: 30px;">Руководитель _________________ / _______________</p>
<p>Бухгалтер &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; _________________ / _______________</p>

</body></html>
`;

const RECONCILIATION_ACT_TEMPLATE = `
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; font-size: 10pt; margin: 0; padding: 0; }
  h1 { text-align: center; font-size: 13pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #000; padding: 5px 8px; }
  th { background: #f0f0f0; font-size: 9pt; }
  .right { text-align: right; }
  .center { text-align: center; }
  .sign-line { border-top: 1px solid #000; margin-top: 40px; width: 250px; text-align: center; font-size: 9pt; color: #666; }
</style></head>
<body>
<h1>АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ</h1>
<p class="center">за период с {{periodStart}} по {{periodEnd}}</p>
<p class="center">по Договору аренды № {{contract.contractNumber}}</p>

<p>Между <strong>{{tenant.name}}</strong> (Арендодатель) и <strong>{{client.companyName}}</strong> (Арендатор)</p>

<table>
<tr>
  <th style="width:50%">По данным {{tenant.name}}</th>
  <th style="width:50%">По данным {{client.companyName}}</th>
</tr>
<tr>
  <td>
    <table style="border:none;">
      <tr><th>Дата</th><th>Документ</th><th>Дебет</th><th>Кредит</th></tr>
      <tr><td colspan="2"><strong>Сальдо на {{periodStart}}</strong></td><td class="right">{{openingBalance}}</td><td></td></tr>
      {{#each invoices}}
      <tr><td>{{this.date}}</td><td>Счёт {{this.number}}</td><td class="right">{{this.amount}}</td><td></td></tr>
      {{/each}}
      {{#each payments}}
      <tr><td>{{this.date}}</td><td>Оплата {{this.reference}}</td><td></td><td class="right">{{this.amount}}</td></tr>
      {{/each}}
      <tr><td colspan="2"><strong>Обороты за период</strong></td><td class="right"><strong>{{totalDebited}}</strong></td><td class="right"><strong>{{totalCredited}}</strong></td></tr>
      <tr><td colspan="2"><strong>Сальдо на {{periodEnd}}</strong></td><td class="right"><strong>{{closingBalance}}</strong></td><td></td></tr>
    </table>
  </td>
  <td class="center" style="vertical-align: middle;"><em>Заполняется контрагентом</em></td>
</tr>
</table>

<p style="margin-top: 20px;">По данным {{tenant.name}}, на {{periodEnd}} задолженность {{client.companyName}} составляет <strong>{{closingBalance}} руб.</strong></p>

<table style="border: none; margin-top: 30px;">
<tr>
<td style="border:none; width:50%;">
  <strong>От Арендодателя:</strong><br><br>
  _____________________ / ___________<br>
  {{tenant.name}}<br>
  <div class="sign-line">Подпись / М.П.</div>
</td>
<td style="border:none; width:50%;">
  <strong>От Арендатора:</strong><br><br>
  _____________________ / ___________<br>
  {{client.companyName}}<br>
  <div class="sign-line">Подпись / М.П.</div>
</td>
</tr>
</table>
</body></html>
`;

const AMENDMENT_TEMPLATE = `
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; }
  h1 { text-align: center; font-size: 14pt; }
  p { margin: 4px 0; text-indent: 1.25cm; text-align: justify; }
  .no-indent { text-indent: 0; }
  .center { text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px; vertical-align: top; }
  .sign-line { border-top: 1px solid #000; margin-top: 50px; width: 250px; text-align: center; font-size: 10pt; color: #666; }
</style></head>
<body>
<h1>ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ № {{amendmentNumber}}</h1>
<p class="center no-indent">к Договору аренды нежилого помещения № {{contract.contractNumber}} от {{contract.startDate}}</p>
<p class="center no-indent">г. Москва &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {{today}}</p>

<p><strong>{{tenant.name}}</strong>, именуемое «Арендодатель», и <strong>{{client.companyName}}</strong>, именуемое «Арендатор», совместно именуемые «Стороны», заключили настоящее Дополнительное соглашение о нижеследующем:</p>

{{#each changes}}
<p>{{inc @index}}. {{this}}</p>
{{/each}}

<p>{{changesCount}}. Настоящее Дополнительное соглашение вступает в силу с момента подписания обеими Сторонами.</p>
<p>{{changesCountPlus1}}. Во всём остальном условия Договора остаются неизменными.</p>
<p>{{changesCountPlus2}}. Настоящее Дополнительное соглашение составлено в двух экземплярах, по одному для каждой из Сторон.</p>

<table style="margin-top: 30px;">
<tr>
<td style="width:50%; border-right: 1px solid #ccc;">
  <strong>Арендодатель:</strong><br><br>
  {{tenant.name}}<br>
  ИНН {{tenant.inn}}<br><br>
  <div class="sign-line">Подпись / М.П.</div>
</td>
<td style="width:50%;">
  <strong>Арендатор:</strong><br><br>
  {{client.companyName}}<br>
  ИНН {{client.inn}}<br><br>
  <div class="sign-line">Подпись / М.П.</div>
</td>
</tr>
</table>
</body></html>
`;

const SCHET_FAKTURA_TEMPLATE = `
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; font-size: 9pt; margin: 0; padding: 0; }
  h1 { text-align: center; font-size: 13pt; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 11pt; font-weight: normal; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 8pt; }
  th { background: #f0f0f0; text-align: center; }
  .no-border td, .no-border th { border: none; }
  .right { text-align: right; }
  .center { text-align: center; }
  .info-block { margin-bottom: 10px; }
  .info-block td { border: none; padding: 2px 4px; vertical-align: top; }
  .info-block td.label { font-weight: bold; white-space: nowrap; width: 220px; }
</style></head>
<body>

<h1>СЧЁТ-ФАКТУРА № {{invoice.number}} от {{invoice.date}}</h1>
<h2>ИСПРАВЛЕНИЕ № — от —</h2>

<table class="info-block" style="margin-bottom: 14px;">
<tr><td class="label">Продавец:</td><td>{{tenant.name}}, ИНН {{tenant.inn}}, КПП {{tenant.kpp}}, адрес: {{tenant.legalAddress}}</td></tr>
<tr><td class="label">Адрес:</td><td>{{tenant.legalAddress}}</td></tr>
<tr><td class="label">ИНН/КПП продавца:</td><td>{{tenant.inn}} / {{tenant.kpp}}</td></tr>
<tr><td class="label">Грузоотправитель и его адрес:</td><td>он же</td></tr>
<tr><td class="label">Грузополучатель и его адрес:</td><td>{{client.companyName}}, {{client.legalAddress}}</td></tr>
<tr><td class="label">К платёжно-расчётному документу:</td><td>{{#if invoice.paymentReference}}№ {{invoice.paymentReference}}{{else}}—{{/if}}</td></tr>
<tr><td class="label">Покупатель:</td><td>{{client.companyName}}</td></tr>
<tr><td class="label">Адрес:</td><td>{{client.legalAddress}}</td></tr>
<tr><td class="label">ИНН/КПП покупателя:</td><td>{{client.inn}}{{#if client.kpp}} / {{client.kpp}}{{/if}}</td></tr>
<tr><td class="label">Валюта: наименование, код:</td><td>Российский рубль, 643</td></tr>
</table>

<table>
<tr>
  <th rowspan="2" style="width:30px;">№<br>п/п</th>
  <th rowspan="2">Наименование товара<br>(описание выполненных работ, оказанных услуг)</th>
  <th rowspan="2" style="width:40px;">Единица<br>измерения</th>
  <th rowspan="2" style="width:45px;">Коли&shy;чество</th>
  <th rowspan="2" style="width:75px;">Цена (тариф)<br>за единицу<br>без НДС, руб.</th>
  <th rowspan="2" style="width:80px;">Стоимость товаров<br>без НДС, руб.</th>
  <th colspan="2">В том числе акциз</th>
  <th rowspan="2" style="width:55px;">Налоговая<br>ставка</th>
  <th rowspan="2" style="width:75px;">Сумма налога,<br>руб.</th>
  <th rowspan="2" style="width:80px;">Стоимость товаров<br>с налогом, руб.</th>
</tr>
<tr>
  <th style="width:50px;">Сумма<br>акциза</th>
  <th style="width:50px;">Без<br>акциза</th>
</tr>
<tr>
  <td class="center">1</td>
  <td>2</td>
  <td class="center">3</td>
  <td class="center">4</td>
  <td class="center">5</td>
  <td class="center">6</td>
  <td class="center">7</td>
  <td class="center">8</td>
  <td class="center">9</td>
  <td class="center">10</td>
  <td class="center">11</td>
</tr>
<tr>
  <td class="center">1</td>
  <td>Аренда нежилого помещения № {{unit.unitNumber}}, {{property.name}}, за период {{invoice.periodStart}} — {{invoice.periodEnd}}</td>
  <td class="center">мес.</td>
  <td class="center">1</td>
  <td class="right">{{invoice.amountExclVat}}</td>
  <td class="right">{{invoice.amountExclVat}}</td>
  <td class="center">без акциза</td>
  <td class="center">без акциза</td>
  <td class="center">{{invoice.vatPercent}}%</td>
  <td class="right">{{invoice.vatAmount}}</td>
  <td class="right">{{invoice.totalAmount}}</td>
</tr>
<tr>
  <td colspan="5" class="right"><strong>Всего к оплате</strong></td>
  <td class="right"><strong>{{invoice.amountExclVat}}</strong></td>
  <td class="center">X</td>
  <td class="center">X</td>
  <td class="center">X</td>
  <td class="right"><strong>{{invoice.vatAmount}}</strong></td>
  <td class="right"><strong>{{invoice.totalAmount}}</strong></td>
</tr>
</table>

<p style="margin-top: 24px;">
  Руководитель организации<br>
  или иное уполномоченное лицо &nbsp;&nbsp; _________________ / {{tenant.name}} /
</p>
<p style="margin-top: 14px;">
  Главный бухгалтер<br>
  или иное уполномоченное лицо &nbsp;&nbsp; _________________ / ___________ /
</p>
<p style="margin-top: 14px;">
  Индивидуальный предприниматель &nbsp;&nbsp; _________________ / ___________ /
</p>

</body></html>
`;

/** Маппинг типов шаблонов */
const TEMPLATE_MAP: Record<string, string> = {
  contract: DEFAULT_TEMPLATE,
  handover_act: HANDOVER_ACT_TEMPLATE,
  invoice: INVOICE_DOCUMENT_TEMPLATE,
  schet_faktura: SCHET_FAKTURA_TEMPLATE,
  reconciliation: RECONCILIATION_ACT_TEMPLATE,
  amendment: AMENDMENT_TEMPLATE,
};

@Injectable()
export class ContractGeneratorService implements OnModuleDestroy {
  private readonly logger = new Logger(ContractGeneratorService.name);
  private template: Handlebars.TemplateDelegate;
  private browser: Browser | null = null;

  private handoverTemplate: Handlebars.TemplateDelegate;
  private invoiceDocTemplate: Handlebars.TemplateDelegate;
  private schetFakturaTemplate: Handlebars.TemplateDelegate;
  private reconciliationTemplate: Handlebars.TemplateDelegate;
  private amendmentTemplate: Handlebars.TemplateDelegate;

  /** Кэш скомпилированных кастомных шаблонов по tenantId:type */
  private customTemplateCache = new Map<string, Handlebars.TemplateDelegate>();

  constructor() {
    // Register helper for 1-based index in {{#each}} loops
    Handlebars.registerHelper('inc', (v: number) => v + 1);

    this.template = Handlebars.compile(DEFAULT_TEMPLATE);
    this.handoverTemplate = Handlebars.compile(HANDOVER_ACT_TEMPLATE);
    this.invoiceDocTemplate = Handlebars.compile(INVOICE_DOCUMENT_TEMPLATE);
    this.schetFakturaTemplate = Handlebars.compile(SCHET_FAKTURA_TEMPLATE);
    this.reconciliationTemplate = Handlebars.compile(RECONCILIATION_ACT_TEMPLATE);
    this.amendmentTemplate = Handlebars.compile(AMENDMENT_TEMPLATE);
  }

  /**
   * Компилирует кастомный шаблон (HTML с Handlebars переменными).
   * Если передан customHtml — использует его, иначе дефолтный.
   */
  compileCustomTemplate(type: string, customHtml?: string | null): Handlebars.TemplateDelegate {
    if (!customHtml) {
      // Вернуть дефолтный
      switch (type) {
        case 'contract': return this.template;
        case 'handover_act': return this.handoverTemplate;
        case 'invoice': return this.invoiceDocTemplate;
        case 'schet_faktura': return this.schetFakturaTemplate;
        case 'reconciliation': return this.reconciliationTemplate;
        case 'amendment': return this.amendmentTemplate;
        default: return this.template;
      }
    }
    const cacheKey = `custom:${type}:${customHtml.length}`;
    if (!this.customTemplateCache.has(cacheKey)) {
      this.customTemplateCache.set(cacheKey, Handlebars.compile(customHtml));
    }
    return this.customTemplateCache.get(cacheKey)!;
  }

  /** Возвращает список доступных переменных для каждого типа шаблона */
  getTemplateVariables(type: string): string[] {
    const common = ['tenant.name', 'tenant.inn', 'tenant.kpp', 'tenant.ogrn', 'tenant.legalAddress', 'tenant.bankName', 'tenant.bankAccount', 'tenant.bik', 'tenant.corrAccount'];
    const client = ['client.companyName', 'client.inn', 'client.kpp', 'client.contactName', 'client.legalAddress'];
    const unit = ['unit.unitNumber', 'unit.floor', 'unit.areaSqm', 'property.name', 'property.address'];

    switch (type) {
      case 'contract':
        return [...common, ...client, ...unit, 'contract.contractNumber', 'contract.startDate', 'contract.endDate', 'contract.monthlyRent', 'contract.depositAmount', 'contract.paymentDay', 'today'];
      case 'invoice':
        return [...common, ...client, ...unit, 'invoice.number', 'invoice.date', 'invoice.amount', 'invoice.vatAmount', 'invoice.totalAmount', 'invoice.periodStart', 'invoice.periodEnd'];
      case 'schet_faktura':
        return [...common, ...client, ...unit, 'invoice.number', 'invoice.date', 'invoice.amountExclVat', 'invoice.vatAmount', 'invoice.vatPercent', 'invoice.totalAmount', 'invoice.periodStart', 'invoice.periodEnd', 'invoice.paymentReference'];
      case 'handover_act':
        return [...common, ...client, ...unit, 'contract.contractNumber', 'today'];
      default:
        return [...common, ...client];
    }
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

  /** Генерирует HTML акта приёма-передачи */
  generateHandoverActHtml(data: {
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
    return this.handoverTemplate({ ...data, today });
  }

  /** Генерирует HTML счёта на оплату */
  generateInvoiceDocHtml(data: {
    tenant: any;
    client: any;
    property: any;
    unit: any;
    invoice: any;
  }): string {
    const totalAmount = Number(data.invoice.totalAmount);
    return this.invoiceDocTemplate({
      ...data,
      invoice: {
        ...data.invoice,
        number: data.invoice.invoiceNumber,
        date: new Date(data.invoice.createdAt || new Date()).toLocaleDateString('ru-RU'),
        amount: Number(data.invoice.amount).toLocaleString('ru-RU'),
        vatAmount: Number(data.invoice.vatAmount || 0) > 0
          ? Number(data.invoice.vatAmount).toLocaleString('ru-RU')
          : null,
        vatPercent: Number(data.invoice.vatAmount || 0) > 0
          ? Math.round((Number(data.invoice.vatAmount) / Number(data.invoice.amount)) * 100)
          : 0,
        totalAmount: totalAmount.toLocaleString('ru-RU'),
        totalWords: this.numberToWords(totalAmount),
        periodStart: data.invoice.periodStart
          ? new Date(data.invoice.periodStart).toLocaleDateString('ru-RU')
          : '—',
        periodEnd: data.invoice.periodEnd
          ? new Date(data.invoice.periodEnd).toLocaleDateString('ru-RU')
          : '—',
      },
    });
  }

  /** Генерирует PDF акта приёма-передачи */
  async generateHandoverActPdf(data: any): Promise<Buffer> {
    const html = this.generateHandoverActHtml(data);
    return this.htmlToPdf(html, 'акт приёма-передачи');
  }

  /** Генерирует PDF счёта на оплату */
  async generateInvoiceDocPdf(data: any): Promise<Buffer> {
    const html = this.generateInvoiceDocHtml(data);
    return this.htmlToPdf(html, 'счёт на оплату');
  }

  /** Генерирует HTML счёта-фактуры (VAT invoice) */
  generateSchetFakturaHtml(data: {
    tenant: any;
    client: any;
    property: any;
    unit: any;
    invoice: any;
  }): string {
    const totalAmount = Number(data.invoice.totalAmount);
    const vatAmount = Number(data.invoice.vatAmount || 0);
    const amountExclVat = totalAmount - vatAmount;
    const vatPercent = amountExclVat > 0
      ? Math.round((vatAmount / amountExclVat) * 100)
      : 20;

    return this.schetFakturaTemplate({
      ...data,
      invoice: {
        ...data.invoice,
        number: data.invoice.invoiceNumber,
        date: new Date(data.invoice.createdAt || new Date()).toLocaleDateString('ru-RU'),
        amountExclVat: amountExclVat.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        vatAmount: vatAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        vatPercent,
        totalAmount: totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        paymentReference: data.invoice.paymentReference || null,
        periodStart: data.invoice.periodStart
          ? new Date(data.invoice.periodStart).toLocaleDateString('ru-RU')
          : '—',
        periodEnd: data.invoice.periodEnd
          ? new Date(data.invoice.periodEnd).toLocaleDateString('ru-RU')
          : '—',
      },
    });
  }

  /** Генерирует PDF счёта-фактуры (VAT invoice) */
  async generateSchetFakturaPdf(data: any): Promise<Buffer> {
    const html = this.generateSchetFakturaHtml(data);
    return this.htmlToPdf(html, 'счёт-фактура');
  }

  /** Конвертирует HTML в PDF */
  private async htmlToPdf(html: string, docName: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '20mm' },
        printBackground: true,
      });
      this.logger.log(`PDF сгенерирован: ${docName}`);
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  /** Генерирует PDF акта сверки */
  async generateReconciliationPdf(data: {
    tenant: any;
    client: any;
    contract: any;
    invoices: { date: string; number: string; amount: string }[];
    payments: { date: string; reference: string; amount: string }[];
    periodStart: string;
    periodEnd: string;
    openingBalance: string;
    totalDebited: string;
    totalCredited: string;
    closingBalance: string;
  }): Promise<Buffer> {
    const html = this.reconciliationTemplate(data);
    return this.htmlToPdf(html, 'акт сверки');
  }

  /** Генерирует PDF дополнительного соглашения */
  async generateAmendmentPdf(data: {
    tenant: any;
    client: any;
    contract: any;
    amendmentNumber: number;
    changes: string[];
  }): Promise<Buffer> {
    const today = new Date().toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const html = this.amendmentTemplate({
      ...data,
      today,
      contract: {
        ...data.contract,
        startDate: new Date(data.contract.startDate).toLocaleDateString('ru-RU'),
      },
      changesCount: data.changes.length + 1,
      changesCountPlus1: data.changes.length + 2,
      changesCountPlus2: data.changes.length + 3,
    });
    return this.htmlToPdf(html, `доп. соглашение №${data.amendmentNumber}`);
  }

  /** Генерирует PDF договора через Puppeteer */
  async generatePdf(data: any): Promise<Buffer> {
    const html = this.generateHtml(data);
    return this.htmlToPdf(html, `договор ${data.contract.contractNumber}`);
  }
}

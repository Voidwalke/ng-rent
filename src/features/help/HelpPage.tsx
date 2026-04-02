import React from 'react';
import { Typography, Collapse, Card, Space, Tag } from 'antd';
import {
  BankOutlined,
  UserOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Title, Paragraph } = Typography;

const managerItems = [
  {
    key: 'mgr-1',
    label: 'Как добавить объект недвижимости?',
    children: (
      <Paragraph>
        Перейдите в раздел «Объекты» &rarr; «Добавить объект». Заполните название, адрес, тип и
        площадь. После сохранения добавьте помещения и загрузите фото.
      </Paragraph>
    ),
  },
  {
    key: 'mgr-2',
    label: 'Как опубликовать объект в каталоге?',
    children: (
      <Paragraph>
        Откройте карточку объекта и нажмите «Опубликовать». Объект появится в публичном каталоге для
        арендаторов.
      </Paragraph>
    ),
  },
  {
    key: 'mgr-3',
    label: 'Как одобрить заявку на аренду?',
    children: (
      <Paragraph>
        В разделе «Заявки» выберите заявку &rarr; «Взять на рассмотрение» &rarr; «Одобрить». После
        одобрения можно сформировать договор.
      </Paragraph>
    ),
  },
  {
    key: 'mgr-4',
    label: 'Как выставить счёт?',
    children: (
      <Paragraph>
        Счета генерируются автоматически при подписании договора и ежемесячно по расписанию. Вы также
        можете создать счёт вручную в разделе «Счета».
      </Paragraph>
    ),
  },
  {
    key: 'mgr-5',
    label: 'Как настроить реквизиты компании?',
    children: (
      <Paragraph>
        Перейдите в «Настройки» &rarr; вкладка «Реквизиты». Заполните ИНН, КПП, ОГРН, банковские
        данные и ставку НДС. Эти данные используются во всех генерируемых документах.
      </Paragraph>
    ),
  },
  {
    key: 'mgr-6',
    label: 'Как скачать документы (договор, акт, счёт-фактуру)?',
    children: (
      <Paragraph>
        На странице договора нажмите соответствующую кнопку: «Договор PDF», «Акт приёма-передачи»,
        «Акт сверки». Для счёта-фактуры — кнопка «СФ» в таблице счетов.
      </Paragraph>
    ),
  },
  {
    key: 'mgr-7',
    label: 'Как работает система пеней?',
    children: (
      <Paragraph>
        При просрочке оплаты начисляется неустойка (по умолчанию 0,1% в день, максимум 10%). Ставку
        можно настроить в каждом договоре.
      </Paragraph>
    ),
  },
  {
    key: 'mgr-8',
    label: 'Что такое QR-код для СКУД?',
    children: (
      <Paragraph>
        Каждая карта доступа имеет уникальный QR-код. Арендатор может показать его на входе вместо
        физической карты.
      </Paragraph>
    ),
  },
];

const tenantItems = [
  {
    key: 'tnt-1',
    label: 'Как подать заявку на аренду?',
    children: (
      <Paragraph>
        В разделе «Помещения» выберите объект и нажмите «Подать заявку». Укажите желаемый период
        аренды. Ответ обычно приходит в течение 1-3 рабочих дней.
      </Paragraph>
    ),
  },
  {
    key: 'tnt-2',
    label: 'Как оплатить счёт?',
    children: (
      <Paragraph>
        В разделе «Мои счета» нажмите «Оплатить». Вы будете перенаправлены на страницу оплаты. Для
        оплаты по реквизитам скачайте счёт в формате PDF.
      </Paragraph>
    ),
  },
  {
    key: 'tnt-3',
    label: 'Как принять договор?',
    children: (
      <Paragraph>
        В разделе «Мои договоры» откройте договор и нажмите «Принять договор». После подтверждения
        администратор активирует договор.
      </Paragraph>
    ),
  },
  {
    key: 'tnt-4',
    label: 'Где найти QR-код для прохода?',
    children: (
      <Paragraph>
        В разделе «Пропуска» нажмите «QR» на активной карте. Покажите QR-код на входе в здание.
      </Paragraph>
    ),
  },
  {
    key: 'tnt-5',
    label: 'Что делать если карта заблокирована?',
    children: (
      <Paragraph>
        Обратитесь в управляющую компанию через раздел «Поддержка». Блокировка может быть связана с
        задолженностью по оплате.
      </Paragraph>
    ),
  },
  {
    key: 'tnt-6',
    label: 'Как создать заявку на обслуживание?',
    children: (
      <Paragraph>
        В разделе «Обслуживание» нажмите «Создать заявку», опишите проблему и выберите приоритет.
      </Paragraph>
    ),
  },
];

const generalItems = [
  {
    key: 'gen-1',
    label: 'Какие тарифы доступны?',
    children: (
      <Paragraph>
        <strong>Free</strong> — 1 объект, 10 помещений (бесплатно)
        <br />
        <strong>Basic</strong> — 3 объекта, 50 помещений (5 000 &#8381;/мес)
        <br />
        <strong>Pro</strong> — 10 объектов, 200 помещений (15 000 &#8381;/мес)
        <br />
        <strong>Enterprise</strong> — без лимитов (45 000 &#8381;/мес)
        <br />
        <br />
        Пробный период 14 дней.
      </Paragraph>
    ),
  },
  {
    key: 'gen-2',
    label: 'Как сменить пароль?',
    children: (
      <Paragraph>
        Настройки &rarr; Профиль &rarr; «Изменить пароль»
      </Paragraph>
    ),
  },
  {
    key: 'gen-3',
    label: 'Как включить двухфакторную аутентификацию?',
    children: (
      <Paragraph>
        Настройки &rarr; Профиль &rarr; переключатель «2FA»
      </Paragraph>
    ),
  },
  {
    key: 'gen-4',
    label: 'Какие документы генерирует система?',
    children: (
      <Paragraph>
        Договор аренды, акт приёма-передачи, счёт на оплату, счёт-фактура (при НДС), акт сверки
        взаимных расчётов, дополнительное соглашение.
      </Paragraph>
    ),
  },
  {
    key: 'gen-5',
    label: 'Как экспортировать данные?',
    children: (
      <Paragraph>
        В разделах «Договоры», «Счета», «Клиенты» есть кнопка «Экспорт» для выгрузки в CSV. Для
        аналитики — кнопка «Экспорт данных».
      </Paragraph>
    ),
  },
];

const HelpPage: React.FC = () => {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Title level={2}>Помощь</Title>
      <Paragraph type="secondary" style={{ marginBottom: 32 }}>
        Часто задаваемые вопросы по работе с платформой NGRent
      </Paragraph>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card
          title={
            <span>
              <BankOutlined style={{ marginRight: 8 }} />
              Для управляющих компаний
            </span>
          }
          size="small"
        >
          <Collapse accordion items={managerItems} />
        </Card>

        <Card
          title={
            <span>
              <UserOutlined style={{ marginRight: 8 }} />
              Для арендаторов
            </span>
          }
          size="small"
        >
          <Collapse accordion items={tenantItems} />
        </Card>

        <Card
          title={
            <span>
              <InfoCircleOutlined style={{ marginRight: 8 }} />
              Общие вопросы
            </span>
          }
          size="small"
        >
          <Collapse accordion items={generalItems} />
        </Card>
      </Space>
    </div>
  );
};

export default HelpPage;

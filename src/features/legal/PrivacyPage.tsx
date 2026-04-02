import React from 'react';
import { Typography, Card, Button, Space, Divider, theme } from 'antd';
import { ArrowLeftOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useThemeStore } from '../../store/theme';

const { Title, Paragraph, Text } = Typography;

const PrivacyPage: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { isDark, toggle: toggleTheme } = useThemeStore();

  return (
    <div style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      {/* Шапка */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 48px',
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Space align="center" size={12}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              N
            </div>
            <Text strong style={{ fontSize: 20 }}>
              NGRent
            </Text>
          </Link>
        </Space>
        <Space>
          <Link to="/catalog">
            <Button>Каталог</Button>
          </Link>
          <Link to="/login">
            <Button>Войти</Button>
          </Link>
          <Button type="text" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
        </Space>
      </div>

      {/* Содержимое */}
      <div style={{ padding: '32px 48px', maxWidth: 960, margin: '0 auto' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
          style={{ marginBottom: 24 }}
        >
          На главную
        </Button>

        <Card>
          <Typography>
            <Title level={2}>Политика конфиденциальности</Title>
            <Paragraph type="secondary">
              Дата последнего обновления: 1 января 2026 г.
            </Paragraph>

            <Divider />

            {/* 1 */}
            <Title level={4}>1. Общие положения</Title>
            <Paragraph>
              1.1. Настоящая Политика конфиденциальности (далее — «Политика») определяет
              порядок обработки и защиты персональных данных пользователей облачной
              SaaS-платформы NGRent (далее — «Сервис»), принадлежащей ООО «НГРент» (далее —
              «Оператор», «мы»).
            </Paragraph>
            <Paragraph>
              1.2. Политика разработана в соответствии с Федеральным законом от 27.07.2006
              N 152-ФЗ «О персональных данных» и иными нормативными актами Российской
              Федерации в области защиты персональных данных.
            </Paragraph>
            <Paragraph>
              1.3. Регистрируясь в Сервисе, Пользователь выражает согласие с настоящей
              Политикой. Если вы не согласны с условиями, пожалуйста, воздержитесь от
              использования Сервиса.
            </Paragraph>

            {/* 2 */}
            <Title level={4}>2. Какие данные мы собираем</Title>
            <Paragraph>
              2.1. <Text strong>Данные, предоставляемые Пользователем при регистрации:</Text>
            </Paragraph>
            <Paragraph>
              <ul>
                <li>Фамилия, имя, отчество</li>
                <li>Адрес электронной почты</li>
                <li>Номер телефона</li>
                <li>Наименование организации и ИНН (для юридических лиц)</li>
              </ul>
            </Paragraph>
            <Paragraph>
              2.2. <Text strong>Данные, собираемые автоматически:</Text>
            </Paragraph>
            <Paragraph>
              <ul>
                <li>IP-адрес</li>
                <li>Тип и версия браузера, операционная система</li>
                <li>Дата и время доступа к Сервису</li>
                <li>Данные файлов cookie (см. раздел 6)</li>
                <li>Сведения о действиях Пользователя в Сервисе (журнал аудита)</li>
              </ul>
            </Paragraph>
            <Paragraph>
              2.3. <Text strong>Данные, вносимые в рамках использования Сервиса:</Text>
            </Paragraph>
            <Paragraph>
              <ul>
                <li>Информация об объектах недвижимости и помещениях</li>
                <li>Сведения об арендаторах и контрагентах</li>
                <li>Документы (договоры, акты, счета)</li>
                <li>Финансовые данные (суммы платежей, задолженности)</li>
              </ul>
            </Paragraph>

            {/* 3 */}
            <Title level={4}>3. Цели обработки персональных данных</Title>
            <Paragraph>
              Мы обрабатываем персональные данные для следующих целей:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>Регистрация и идентификация Пользователя в Сервисе.</li>
                <li>Предоставление доступа к функциям Сервиса в соответствии с тарифным планом.</li>
                <li>Выставление счетов и обработка платежей.</li>
                <li>Техническая поддержка и обработка обращений.</li>
                <li>Обеспечение безопасности аккаунта (двухфакторная аутентификация, журнал аудита).</li>
                <li>Улучшение качества Сервиса и аналитика использования.</li>
                <li>Исполнение обязательств по договору (оферте).</li>
                <li>Соблюдение требований законодательства РФ.</li>
              </ul>
            </Paragraph>

            {/* 4 */}
            <Title level={4}>4. Хранение и защита данных</Title>
            <Paragraph>
              4.1. Персональные данные хранятся на серверах, расположенных на территории
              Российской Федерации, в соответствии с требованиями ст. 18 152-ФЗ.
            </Paragraph>
            <Paragraph>
              4.2. Для защиты данных применяются следующие меры:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>Шифрование данных при передаче (TLS/SSL).</li>
                <li>Шифрование паролей с использованием bcrypt.</li>
                <li>Изоляция данных организаций с использованием Row-Level Security (RLS) в PostgreSQL.</li>
                <li>Ограничение доступа на основе ролевой модели (RBAC).</li>
                <li>Регулярное резервное копирование данных.</li>
                <li>Мониторинг и журналирование всех действий (аудит-лог).</li>
              </ul>
            </Paragraph>
            <Paragraph>
              4.3. Персональные данные хранятся в течение всего срока действия учётной
              записи Пользователя и в течение 90 дней после её удаления, если иное не
              предусмотрено законодательством.
            </Paragraph>

            {/* 5 */}
            <Title level={4}>5. Права субъекта персональных данных</Title>
            <Paragraph>
              В соответствии со 152-ФЗ Пользователь имеет право:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>Получить информацию об обработке своих персональных данных.</li>
                <li>Требовать уточнения, блокирования или уничтожения персональных данных.</li>
                <li>Отозвать согласие на обработку персональных данных.</li>
                <li>Обжаловать действия Оператора в Роскомнадзор или в судебном порядке.</li>
                <li>Запросить экспорт своих данных в машиночитаемом формате.</li>
              </ul>
            </Paragraph>
            <Paragraph>
              Для реализации указанных прав направьте запрос на{' '}
              <a href="mailto:privacy@ngrent.ru">privacy@ngrent.ru</a> с указанием
              фамилии, имени и адреса электронной почты, привязанного к учётной записи.
              Срок рассмотрения запроса — не более 30 дней.
            </Paragraph>

            {/* 6 */}
            <Title level={4}>6. Файлы cookie</Title>
            <Paragraph>
              6.1. Сервис использует файлы cookie для следующих целей:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>
                  <Text strong>Необходимые cookie</Text> — обеспечение авторизации, хранение
                  сессии и токенов доступа (JWT).
                </li>
                <li>
                  <Text strong>Функциональные cookie</Text> — сохранение пользовательских
                  настроек (тема оформления, язык интерфейса).
                </li>
                <li>
                  <Text strong>Аналитические cookie</Text> — сбор обезличенной статистики
                  использования Сервиса для улучшения качества.
                </li>
              </ul>
            </Paragraph>
            <Paragraph>
              6.2. Пользователь может управлять файлами cookie через настройки браузера.
              Отключение необходимых cookie может привести к невозможности использования
              Сервиса.
            </Paragraph>

            {/* 7 */}
            <Title level={4}>7. Передача данных третьим лицам</Title>
            <Paragraph>
              7.1. Оператор не продаёт и не передаёт персональные данные третьим лицам,
              за исключением следующих случаев:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>Наличие явного согласия Пользователя.</li>
                <li>Исполнение требований законодательства РФ (по запросу уполномоченных органов).</li>
                <li>Обработка платежей через сертифицированных платёжных провайдеров (передаются только данные, необходимые для проведения транзакции).</li>
              </ul>
            </Paragraph>

            {/* 8 */}
            <Title level={4}>8. Изменения Политики</Title>
            <Paragraph>
              8.1. Оператор вправе вносить изменения в настоящую Политику. Актуальная
              редакция всегда доступна по адресу{' '}
              <Link to="/privacy">ngrent.ru/privacy</Link>.
            </Paragraph>
            <Paragraph>
              8.2. О существенных изменениях Пользователь уведомляется по электронной
              почте не менее чем за 14 дней до вступления изменений в силу.
            </Paragraph>

            {/* 9 */}
            <Title level={4}>9. Контактная информация</Title>
            <Paragraph>
              <strong>ООО «НГРент»</strong>
              <br />
              Ответственный за обработку персональных данных
              <br />
              Адрес: 123456, г. Москва, ул. Примерная, д. 1, офис 101
              <br />
              Электронная почта:{' '}
              <a href="mailto:privacy@ngrent.ru">privacy@ngrent.ru</a>
              <br />
              Телефон: +7 (495) 123-45-67
            </Paragraph>

            <Divider />

            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              Используя платформу NGRent, вы подтверждаете, что ознакомились с настоящей
              Политикой конфиденциальности. См. также:{' '}
              <Link to="/terms">Пользовательское соглашение</Link>.
            </Paragraph>
          </Typography>
        </Card>
      </div>

      {/* Подвал */}
      <div
        style={{
          padding: '24px 48px',
          textAlign: 'center',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          marginTop: 48,
        }}
      >
        <Space split={<Divider type="vertical" />}>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/terms">Пользовательское соглашение</Link>
          <Link to="/catalog">Каталог</Link>
        </Space>
        <br />
        <Text type="secondary" style={{ marginTop: 8, display: 'inline-block' }}>
          &copy; {new Date().getFullYear()} NGRent. Все права защищены.
        </Text>
      </div>
    </div>
  );
};

export default PrivacyPage;

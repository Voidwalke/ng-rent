import React from 'react';
import { Card, Steps, Button, message } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../../api/endpoints';

// Шаги должны совпадать с бэкендом (onboarding.service.ts)
const STEPS = [
  { key: 'company_info', title: 'Данные компании', description: 'Заполните реквизиты организации' },
  { key: 'first_property', title: 'Первый объект', description: 'Добавьте объект недвижимости' },
  { key: 'first_units', title: 'Помещения', description: 'Создайте помещения в объекте' },
  { key: 'invite_team', title: 'Команда', description: 'Пригласите коллег' },
  { key: 'publish', title: 'Публикация', description: 'Опубликуйте объект в каталоге' },
  { key: 'setup_payment', title: 'Оплата', description: 'Настройте приём платежей' },
];

interface OnboardingResponse {
  steps: { key: string; completed: boolean }[];
  isCompleted: boolean;
  completedAt: string | null;
  progress: string;
}

const OnboardingBanner: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: onboarding } = useQuery<OnboardingResponse>({
    queryKey: ['onboarding'],
    queryFn: () => settingsApi.getOnboarding(),
    retry: false,
  });

  const completeMutation = useMutation({
    mutationFn: (step: string) => settingsApi.completeOnboardingStep(step),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding'] }),
  });

  const skipMutation = useMutation({
    mutationFn: () => settingsApi.skipOnboarding(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding'] });
      message.success('Онбординг пропущен');
    },
  });

  if (!onboarding || onboarding.isCompleted) return null;

  const completedKeys = (onboarding.steps || [])
    .filter((s) => s.completed)
    .map((s) => s.key);

  const currentIdx = STEPS.findIndex((s) => !completedKeys.includes(s.key));

  return (
    <Card
      title={`Начало работы (${onboarding.progress})`}
      style={{ marginBottom: 16 }}
      extra={
        <Button size="small" onClick={() => skipMutation.mutate()}>
          Пропустить
        </Button>
      }
    >
      <Steps
        current={currentIdx === -1 ? STEPS.length : currentIdx}
        size="small"
        items={STEPS.map((s) => ({
          title: s.title,
          description: s.description,
          icon: completedKeys.includes(s.key)
            ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
            : undefined,
        }))}
      />
    </Card>
  );
};

export default OnboardingBanner;

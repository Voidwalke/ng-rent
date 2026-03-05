import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ONBOARDING_STEPS = [
  'company_info', // Заполнить реквизиты
  'first_property', // Создать первый объект
  'first_units', // Добавить помещения
  'invite_team', // Пригласить менеджера
  'publish', // Опубликовать объект
  'setup_payment', // Привязать карту
];

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  /** Текущий прогресс онбординга */
  async getProgress(tenantId: number) {
    let progress = await this.prisma.onboardingProgress.findFirst({
      where: { tenantId },
    });

    if (!progress) {
      progress = await this.prisma.onboardingProgress.create({
        data: { tenantId, stepsCompleted: [] },
      });
    }

    const completed = (progress.stepsCompleted as string[]) || [];

    return {
      steps: ONBOARDING_STEPS.map((step) => ({
        key: step,
        completed: completed.includes(step),
      })),
      isCompleted: progress.isCompleted,
      completedAt: progress.completedAt,
      progress: `${completed.length}/${ONBOARDING_STEPS.length}`,
    };
  }

  /** Отметить шаг как пройденный */
  async completeStep(tenantId: number, step: string) {
    if (!ONBOARDING_STEPS.includes(step)) {
      throw new NotFoundException(`Неизвестный шаг: ${step}`);
    }

    const progress = await this.prisma.onboardingProgress.findFirst({
      where: { tenantId },
    });
    if (!progress) throw new NotFoundException('Прогресс не найден');

    const completed = new Set<string>(
      (progress.stepsCompleted as string[]) || [],
    );
    completed.add(step);

    const allDone = ONBOARDING_STEPS.every((s) => completed.has(s));

    return this.prisma.onboardingProgress.update({
      where: { id: progress.id },
      data: {
        stepsCompleted: Array.from(completed),
        isCompleted: allDone,
        completedAt: allDone ? new Date() : null,
      },
    });
  }

  /** Пропустить онбординг */
  async skip(tenantId: number) {
    const progress = await this.prisma.onboardingProgress.findFirst({
      where: { tenantId },
    });
    if (!progress) throw new NotFoundException();

    return this.prisma.onboardingProgress.update({
      where: { id: progress.id },
      data: { isCompleted: true, completedAt: new Date() },
    });
  }
}

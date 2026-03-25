import { BadRequestException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

// Допустимые переходы между состояниями заявки
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['contract_sent'],
  rejected: [],
  contract_sent: ['signed'],
  signed: ['active', 'terminated'],
  active: ['terminated'],
  terminated: [],
};

export function validateTransition(
  current: ApplicationStatus,
  next: ApplicationStatus,
): void {
  const allowed = TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new BadRequestException(
      `Нельзя перевести заявку из "${current}" в "${next}"`,
    );
  }
}

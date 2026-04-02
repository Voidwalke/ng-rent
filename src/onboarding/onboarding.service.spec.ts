import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OnboardingService', () => {
  let service: OnboardingService;

  const mockPrisma = {
    onboardingProgress: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProgress', () => {
    it('should return steps array with correct structure', async () => {
      mockPrisma.onboardingProgress.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        stepsCompleted: ['company_info', 'first_property'],
        isCompleted: false,
        completedAt: null,
      });

      const result = await service.getProgress(1);

      expect(result).toHaveProperty('steps');
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.steps.length).toBe(6);
      for (const step of result.steps) {
        expect(step).toHaveProperty('key');
        expect(step).toHaveProperty('completed');
        expect(typeof step.key).toBe('string');
        expect(typeof step.completed).toBe('boolean');
      }
    });

    it('should mark completed steps correctly', async () => {
      mockPrisma.onboardingProgress.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        stepsCompleted: ['company_info', 'first_property'],
        isCompleted: false,
        completedAt: null,
      });

      const result = await service.getProgress(1);

      const companyStep = result.steps.find((s) => s.key === 'company_info');
      expect(companyStep!.completed).toBe(true);

      const publishStep = result.steps.find((s) => s.key === 'publish');
      expect(publishStep!.completed).toBe(false);

      expect(result.progress).toBe('2/6');
      expect(result.isCompleted).toBe(false);
    });

    it('should create progress record if not found', async () => {
      mockPrisma.onboardingProgress.findFirst.mockResolvedValueOnce(null);
      mockPrisma.onboardingProgress.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        stepsCompleted: [],
        isCompleted: false,
        completedAt: null,
      });

      const result = await service.getProgress(1);

      expect(mockPrisma.onboardingProgress.create).toHaveBeenCalledWith({
        data: { tenantId: 1, stepsCompleted: [] },
      });
      expect(result.steps.every((s) => !s.completed)).toBe(true);
      expect(result.progress).toBe('0/6');
    });
  });

  describe('completeStep', () => {
    it('should mark step as done', async () => {
      mockPrisma.onboardingProgress.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        stepsCompleted: ['company_info'],
        isCompleted: false,
      });
      mockPrisma.onboardingProgress.update.mockResolvedValueOnce({
        id: 1,
        stepsCompleted: ['company_info', 'first_property'],
        isCompleted: false,
      });

      const result = await service.completeStep(1, 'first_property');

      expect(mockPrisma.onboardingProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            stepsCompleted: expect.arrayContaining([
              'company_info',
              'first_property',
            ]),
            isCompleted: false,
          }),
        }),
      );
    });

    it('should set isCompleted when all steps done', async () => {
      mockPrisma.onboardingProgress.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        stepsCompleted: [
          'company_info',
          'first_property',
          'first_units',
          'invite_team',
          'publish',
        ],
        isCompleted: false,
      });
      mockPrisma.onboardingProgress.update.mockResolvedValueOnce({
        id: 1,
        stepsCompleted: [
          'company_info',
          'first_property',
          'first_units',
          'invite_team',
          'publish',
          'setup_payment',
        ],
        isCompleted: true,
      });

      await service.completeStep(1, 'setup_payment');

      expect(mockPrisma.onboardingProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCompleted: true,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw NotFoundException with unknown step', async () => {
      await expect(service.completeStep(1, 'unknown_step')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.completeStep(1, 'unknown_step')).rejects.toThrow(
        /Неизвестный шаг/,
      );
    });

    it('should throw NotFoundException when progress not found', async () => {
      mockPrisma.onboardingProgress.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.completeStep(1, 'company_info'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

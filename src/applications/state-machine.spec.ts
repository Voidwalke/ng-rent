import { BadRequestException } from '@nestjs/common';
import { validateTransition } from './state-machine';

describe('Application State Machine', () => {
  describe('validateTransition', () => {
    const validTransitions = [
      ['draft', 'submitted'],
      ['submitted', 'under_review'],
      ['under_review', 'approved'],
      ['under_review', 'rejected'],
      ['approved', 'contract_sent'],
      ['contract_sent', 'signed'],
      ['signed', 'active'],
      ['signed', 'terminated'],
      ['active', 'terminated'],
    ] as const;

    it.each(validTransitions)(
      'should allow transition from %s to %s',
      (from, to) => {
        expect(() => validateTransition(from as any, to as any)).not.toThrow();
      },
    );

    const invalidTransitions = [
      ['draft', 'approved'],
      ['draft', 'active'],
      ['draft', 'terminated'],
      ['submitted', 'approved'],
      ['submitted', 'rejected'],
      ['submitted', 'terminated'],
      ['under_review', 'contract_sent'],
      ['approved', 'active'],
      ['rejected', 'submitted'],
      ['rejected', 'approved'],
      ['rejected', 'terminated'],
      ['contract_sent', 'active'],
      ['contract_sent', 'terminated'],
      ['active', 'draft'],
      ['terminated', 'active'],
      ['terminated', 'draft'],
    ] as const;

    it.each(invalidTransitions)(
      'should reject transition from %s to %s',
      (from, to) => {
        expect(() => validateTransition(from as any, to as any)).toThrow(
          BadRequestException,
        );
      },
    );

    it('should include state names in error message', () => {
      try {
        validateTransition('draft' as any, 'active' as any);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err.message).toContain('draft');
        expect(err.message).toContain('active');
      }
    });

    it('terminated should be a terminal state', () => {
      expect(() =>
        validateTransition('terminated' as any, 'active' as any),
      ).toThrow(BadRequestException);
      expect(() =>
        validateTransition('terminated' as any, 'draft' as any),
      ).toThrow(BadRequestException);
    });
  });
});

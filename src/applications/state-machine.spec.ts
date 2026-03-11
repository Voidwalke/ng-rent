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
      ['submitted', 'approved'],
      ['submitted', 'rejected'],
      ['under_review', 'contract_sent'],
      ['approved', 'active'],
      ['rejected', 'submitted'],
      ['rejected', 'approved'],
      ['contract_sent', 'active'],
      ['active', 'draft'],
      ['active', 'terminated'],
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
  });
});

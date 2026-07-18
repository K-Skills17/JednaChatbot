import { describe, it, expect } from 'vitest';
import { scoreQualification } from '../../concierge/qualification';

describe('scoreQualification — deterministic scoring', () => {
  it('scores 0 for empty data', () => {
    const { score, qualified } = scoreQualification({});
    expect(score).toBe(0);
    expect(qualified).toBe(false);
  });

  it('scores treatment_need (20 points)', () => {
    const { score } = scoreQualification({ treatment_need: 'implant' });
    expect(score).toBe(20);
  });

  it('scores location_ok (25 points)', () => {
    const { score } = scoreQualification({ location_ok: true });
    expect(score).toBe(25);
  });

  it('does not score location_ok if false', () => {
    const { score } = scoreQualification({ location_ok: false });
    expect(score).toBe(0);
  });

  it('scores prior_patient (10 points)', () => {
    const { score } = scoreQualification({ prior_patient: 'yes' });
    expect(score).toBe(10);
  });

  it('scores has_slot for preferred_day (20 points)', () => {
    const { score } = scoreQualification({ preferred_day: 'Monday' });
    expect(score).toBe(20);
  });

  it('scores has_slot for preferred_period (20 points)', () => {
    const { score } = scoreQualification({ preferred_period: 'morning' });
    expect(score).toBe(20);
  });

  it('scores near_term when matching keyword (25 points)', () => {
    const { score } = scoreQualification({ timeline: 'asap' });
    expect(score).toBe(25);
  });

  it('does not score timeline when no keyword match', () => {
    const { score } = scoreQualification({ timeline: 'maybe next year' });
    expect(score).toBe(0);
  });

  it('qualifies at threshold (60)', () => {
    // treatment_need (20) + location_ok (25) + timeline near-term (25) = 70
    const { score, qualified } = scoreQualification({
      treatment_need: 'implant',
      location_ok: true,
      timeline: 'urgent',
    });
    expect(score).toBe(70);
    expect(qualified).toBe(true);
  });

  it('does not qualify below threshold', () => {
    // treatment_need (20) + prior_patient (10) = 30
    const { score, qualified } = scoreQualification({
      treatment_need: 'denture',
      prior_patient: 'no',
    });
    expect(score).toBe(30);
    expect(qualified).toBe(false);
  });

  it('caps at 100', () => {
    const { score } = scoreQualification({
      treatment_need: 'implant',
      location_ok: true,
      prior_patient: 'yes',
      preferred_day: 'Tuesday',
      timeline: 'asap',
    });
    expect(score).toBe(100);
  });

  it('respects custom rules', () => {
    const { score, qualified } = scoreQualification(
      { treatment_need: 'whitening' },
      { weights: { treatment_need: 50 }, qualified_threshold: 40 },
    );
    expect(score).toBe(50);
    expect(qualified).toBe(true);
  });

  it('respects custom near_term_keywords', () => {
    const { score } = scoreQualification(
      { timeline: 'immediately' },
      { near_term_keywords: ['immediately'] },
    );
    expect(score).toBe(25);
  });

  it('keyword matching is case-insensitive', () => {
    const { score } = scoreQualification({ timeline: 'URGENT' });
    expect(score).toBe(25);
  });
});

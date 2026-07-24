const {
  normalizeExerciseGoal,
  sanitizeExerciseGoals,
  getGoalPerformanceFromExercise,
  updateExerciseGoalProgress,
  attachExerciseGoalSnapshots,
  buildGoalInsight,
} = require('../script');

describe('custom exercise goals', () => {
  it('normalizes a future-ready weight goal with derived progress', () => {
    const goal = normalizeExerciseGoal({
      exerciseName: 'Shoulder Press',
      goalType: 'weight',
      goalValue: 225,
      dateCreated: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-01-02T00:00:00.000Z',
      currentBestPerformance: 190,
    });

    expect(goal.goalWeight).toBe(225);
    expect(goal.unit).toBe('lbs');
    expect(goal.remainingDistanceToGoal).toBe(35);
    expect(goal.progressPercentage).toBe(84.4);
  });

  it('rejects invalid goals and keys valid goals by exercise', () => {
    const goals = sanitizeExerciseGoals({
      bench: { exerciseName: 'Bench Press', goalType: 'weight', goalValue: 315 },
      broken: { exerciseName: 'Squat', goalType: 'weight', goalValue: -10 },
    });

    expect(Object.keys(goals)).toEqual(['bench press']);
  });

  it('finds the best performance for weight, reps, cardio, and supersets', () => {
    expect(getGoalPerformanceFromExercise({
      name: 'Bench Press',
      sets: [{ weight: 185, reps: 8 }, { weight: 195, reps: 5 }],
    }, 'weight')).toBe(195);
    expect(getGoalPerformanceFromExercise({
      name: 'Pull-ups',
      sets: [{ weight: 0, reps: 10 }, { weight: 0, reps: 12 }],
    }, 'reps')).toBe(12);
    expect(getGoalPerformanceFromExercise({
      name: 'Running',
      isCardio: true,
      sets: [{ distance: 3.1, duration: 1500 }],
    }, 'duration')).toBe(25);
    expect(getGoalPerformanceFromExercise({
      name: 'Curl + Press',
      isSuperset: true,
      exercises: ['Curl', 'Press'],
      sets: [{
        exercises: [
          { name: 'Curl', weight: 50, reps: 10 },
          { name: 'Press', weight: 80, reps: 8 },
        ],
      }],
    }, 'weight', 'Press')).toBe(80);
  });

  it('keeps the all-time best and never shows negative remaining progress', () => {
    const base = normalizeExerciseGoal({
      exerciseName: 'Squat',
      goalType: 'weight',
      goalValue: 405,
      currentBestPerformance: 365,
    });
    const lowerDay = updateExerciseGoalProgress(base, 355, '2026-02-01T00:00:00.000Z');
    const reached = updateExerciseGoalProgress(base, 410, '2026-03-01T00:00:00.000Z');

    expect(lowerDay.currentBestPerformance).toBe(365);
    expect(reached.currentBestPerformance).toBe(410);
    expect(reached.progressPercentage).toBe(100);
    expect(reached.remainingDistanceToGoal).toBe(0);
  });

  it('attaches only goals for exercises performed in the workout', () => {
    const exercises = [
      { name: 'Bench Press', sets: [{ weight: 225, reps: 5 }] },
      { name: 'Shoulder Press', sets: [{ weight: 190, reps: 4 }] },
    ];
    const goals = sanitizeExerciseGoals({
      bench: { exerciseName: 'Bench Press', goalType: 'weight', goalValue: 315 },
      squat: { exerciseName: 'Squat', goalType: 'weight', goalValue: 405 },
      shoulder: { exerciseName: 'Shoulder Press', goalType: 'weight', goalValue: 225 },
      legpress: { exerciseName: 'Leg Press', goalType: 'weight', goalValue: 500 },
    });
    const output = attachExerciseGoalSnapshots(exercises, goals, '2026-07-24');

    expect(output).toHaveLength(2);
    expect(output.map((exercise) => exercise.goal.exerciseName)).toEqual([
      'Bench Press',
      'Shoulder Press',
    ]);
    expect(JSON.stringify(output)).not.toMatch(/Squat|Leg Press/);
    expect(output[1].goal.currentBestPerformance).toBe(190);
    expect(output[1].goal.remainingDistanceToGoal).toBe(35);
    expect(output[1].goal.datePerformed).toBe('2026-07-24');
  });

  it('produces sustainable guidance instead of jumping straight to the goal', () => {
    const goal = normalizeExerciseGoal({
      exerciseName: 'Shoulder Press',
      goalType: 'weight',
      goalValue: 225,
      currentBestPerformance: 185,
    });

    expect(buildGoalInsight(goal)).toMatch(/40 lbs away/);
    expect(buildGoalInsight(goal)).toMatch(/189\.5 lbs/);
    expect(buildGoalInsight(goal)).toMatch(/rather than forcing a jump/);
  });
});

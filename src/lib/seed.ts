export const seedWorkspace = {
  name: "CoachOS Demo",
  invite_code: "COACHOS-DEMO",
};

export const seedClients = [
  { name: "Avery Johnson", email: "avery@coachos.dev" },
  { name: "Morgan Lee", email: "morgan@coachos.dev" },
];

export const seedTemplates = [
  {
    name: "Upper Power",
    workout_type: "bodybuilding",
    items: [
      {
        exercise: "Bench Press",
        sets: 4,
        reps: 6,
        rest: "120s",
        rpe: 8,
        tempo: "3-1-1",
      },
    ],
  },
  {
    name: "AMRAP 16",
    workout_type: "crossfit",
    blocks: [
      {
        type: "amrap",
        duration: 16,
        movements: [
          { movement: "Burpees", reps: "10" },
          { movement: "KB Swings", reps: "20" },
        ],
      },
    ],
  },
];

export const seedAssignedWorkouts = [
  {
    client_email: "avery@coachos.dev",
    template_name: "Upper Power",
    date: "2024-04-08",
  },
  {
    client_email: "morgan@coachos.dev",
    template_name: "AMRAP 16",
    date: "2024-04-09",
  },
];

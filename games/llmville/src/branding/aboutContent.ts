export const ABOUT_LEDE =
  "LLMville is a cozy co-op game you play in the browser. Start in a humble garage, rack up GPUs, train language models, and earn income by serving tokens — all in a warm 3D world you can explore with friends and agents.";

export const ABOUT_SECTIONS = [
  {
    title: "Your lab, your pace",
    body: "Walk your space in 3D, place racks and cooling, and tune how compute splits between training and serving. There is no rush — expand when your models and income are ready.",
  },
  {
    title: "Train models, serve tokens",
    body: "Unlock base models, run post-training jobs, and launch models to production. Revenue comes from real serving throughput: tokens per second times value per token, driven by the TFLOP pool you build.",
  },
  {
    title: "One hivemind of compute",
    body: "Every GPU feeds a shared TFLOP pool. Training and inference draw from the same resource, so you choose the tradeoff: max income, max training speed, or a balanced split.",
  },
  {
    title: "Co-op by design",
    body: "LLMville is built for shared labs and friendly competition. Sign in, pick a founder mentor, and grow from garage to datacenter with persistent cloud saves.",
  },
] as const;

export const ABOUT_PLAY_STEPS = [
  "Sign in or create an account",
  "Choose a founder mentor for your new lab",
  "Place hardware, train your first model, and start serving",
] as const;

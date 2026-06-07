export interface PlaybookStep {
  id: string;
  position: number;
  command: string;
  delayMs: number;
}

export interface Playbook {
  id: string;
  title: string;
  description: string | null;
  steps: PlaybookStep[];
  createdAt: string;
  updatedAt: string;
}

export interface StepInput {
  command: string;
  delayMs: number;
}

export interface CreatePlaybookPayload {
  title: string;
  description: string | null;
  steps: StepInput[];
}

export interface UpdatePlaybookPayload {
  title: string;
  description: string | null;
  steps: StepInput[];
}

export interface AppConfig {
  pageTitle: string;
  pageDescription: string;
  companyName: string;

  supportsChatInput: boolean;
  supportsVideoInput: boolean;
  supportsScreenShare: boolean;
  isPreConnectBufferEnabled: boolean;

  logo: string;
  startButtonText: string;
  accent?: string;
  logoDark?: string;
  accentDark?: string;

  audioVisualizerType?: 'bar' | 'wave' | 'grid' | 'radial' | 'aura';
  audioVisualizerColor?: `#${string}`;
  audioVisualizerColorDark?: `#${string}`;
  audioVisualizerColorShift?: number;
  audioVisualizerBarCount?: number;
  audioVisualizerGridRowCount?: number;
  audioVisualizerGridColumnCount?: number;
  audioVisualizerRadialBarCount?: number;
  audioVisualizerRadialRadius?: number;
  audioVisualizerWaveLineWidth?: number;

  // agent dispatch configuration
  agentName?: string;

  // LiveKit Cloud Sandbox configuration
  sandboxId?: string;

  // Display-only model mode (agent-side config; never put API keys here)
  modelMode?: string;
}

export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: 'Echo',
  pageTitle: 'Echo — Personal Voice Assistant',
  pageDescription: 'Talk to your personal voice assistant',

  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  isPreConnectBufferEnabled: true,

  logo: '/echo-logo.svg',
  accent: '#0d9488',
  logoDark: '/echo-logo-dark.svg',
  accentDark: '#2dd4bf',
  startButtonText: 'Start conversation',

  audioVisualizerType: 'aura',
  audioVisualizerColor: '#0d9488',
  audioVisualizerColorDark: '#2dd4bf',
  audioVisualizerColorShift: 0.2,

  // Explicit dispatch — must match agent_name in agent/src/agent.py
  agentName: process.env.AGENT_NAME ?? 'echo-agent',

  sandboxId: process.env.SANDBOX_ID ?? process.env.NEXT_PUBLIC_SANDBOX_ID ?? undefined,

  modelMode: process.env.NEXT_PUBLIC_MODEL_MODE ?? 'inference',
};

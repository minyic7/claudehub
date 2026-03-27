import { spawn, type IPty } from "node-pty";

const DEFAULT_BUFFER_LINES = 10000;

/** Ring buffer for terminal output history */
export class RingBuffer {
  private buffer: Buffer[] = [];
  private maxLines: number;
  private currentLine = Buffer.alloc(0);

  constructor(maxLines = DEFAULT_BUFFER_LINES) {
    this.maxLines = maxLines;
  }

  write(data: Buffer): void {
    // Split incoming data by newlines
    const str = data.toString();
    const parts = str.split("\n");

    for (let i = 0; i < parts.length; i++) {
      this.currentLine = Buffer.concat([
        this.currentLine,
        Buffer.from(parts[i]),
      ]);
      if (i < parts.length - 1) {
        // End of line
        this.buffer.push(
          Buffer.concat([this.currentLine, Buffer.from("\n")]),
        );
        this.currentLine = Buffer.alloc(0);
        if (this.buffer.length > this.maxLines) {
          this.buffer.shift();
        }
      }
    }
  }

  /** Get all buffered output as a single Buffer */
  getHistory(): Buffer {
    const all = [...this.buffer];
    if (this.currentLine.length > 0) {
      all.push(this.currentLine);
    }
    return Buffer.concat(all);
  }

  clear(): void {
    this.buffer = [];
    this.currentLine = Buffer.alloc(0);
  }
}

export interface PTYInstance {
  pty: IPty;
  ringBuffer: RingBuffer;
  pid: number;
  startedAt: Date;
}

const instances = new Map<string, PTYInstance>();

export function spawnPTY(
  key: string,
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
  onData?: (data: Buffer) => void,
  onExit?: (code: number) => void,
): PTYInstance {
  // Kill existing if any
  killPTY(key);

  const mergedEnv = { ...process.env, ...env } as Record<string, string>;

  const ptyProcess = spawn(command, args, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd,
    env: mergedEnv,
  });

  const ringBuffer = new RingBuffer();

  ptyProcess.onData((data) => {
    const buf = Buffer.from(data);
    ringBuffer.write(buf);
    onData?.(buf);
  });

  ptyProcess.onExit(({ exitCode }) => {
    instances.delete(key);
    onExit?.(exitCode);
  });

  const instance: PTYInstance = {
    pty: ptyProcess,
    ringBuffer,
    pid: ptyProcess.pid,
    startedAt: new Date(),
  };

  instances.set(key, instance);
  return instance;
}

export function getPTY(key: string): PTYInstance | undefined {
  return instances.get(key);
}

export function killPTY(key: string): void {
  const instance = instances.get(key);
  if (instance) {
    try {
      instance.pty.kill();
    } catch {
      // Process may already be dead
    }
    instances.delete(key);
  }
}

export function writeToPTY(key: string, data: string): boolean {
  const instance = instances.get(key);
  if (!instance) return false;
  instance.pty.write(data);
  return true;
}

export function getAllPTYKeys(): string[] {
  return Array.from(instances.keys());
}

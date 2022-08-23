// Bazx implementation for Deno.

/// <reference path="./deno.d.ts" />

export * from "./mod.ts";

import type { BazxExec, BazxOptions } from "./mod.ts";

import { createBazx } from "./mod.ts";

function streamCopyToStream(reader: Deno.Reader & Deno.Closer) {
  const buffer = new Uint8Array(16_640);
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        let read;
        try {
          while (controller.desiredSize! > 0) {
            if (
              (read = await reader.read(
                buffer.subarray(
                  0,
                  Math.min(
                    buffer.byteLength,
                    controller.desiredSize ?? Number.MAX_VALUE,
                  ),
                ),
              )) === null
            ) {
              reader.close();
              controller.close();
              return;
            }
            controller.enqueue(buffer.slice(0, read));
          }
        } catch (err) {
          if (!(err instanceof Deno.errors.BadResource)) {
            controller.error(err);
          } else {
            controller.close();
          }
        }
      },
      cancel() {
        reader.close();
      },
    },
    new ByteLengthQueuingStrategy({
      highWaterMark: 16640,
    }),
  );
}

async function pipeReadableStream2Writer(
  readable: ReadableStream<Uint8Array>,
  writer: Deno.Writer & Deno.Closer,
) {
  const reader = readable.getReader();
  try {
    let read: ReadableStreamReadResult<Uint8Array>;
    while (!(read = await reader.read()).done) {
      if (!await writer.write(read.value!)) {
        break;
      }
    }
    await reader.cancel();
  } catch (err) {
    if (err instanceof Deno.errors.BrokenPipe) {
      await reader.releaseLock();
    } else {
      await reader.cancel(err);
    }
  } finally {
    try {
      writer.close();
    } catch (ignored) {}
  }
}

export const exec: BazxExec = async function exec(cmd, {
  cwd,
  env,
  stdin,
  stdout,
  stderr,
  signal,
} = {}) {
  const process = Deno.run({
    cmd,
    cwd,
    env,
    stdin: stdin ? "piped" : "null",
    stdout: stdout ? "piped" : "null",
    stderr: stderr ? "piped" : "null",
  });
  signal?.addEventListener("abort", () => process.kill?.(9), { once: true });
  try {
    const [{ code, signal: exitSignal }] = await Promise.all([
      process.status(),
      stdin && pipeReadableStream2Writer(stdin, process.stdin!),
      stdout && streamCopyToStream(process.stdout!).pipeTo(stdout),
      stderr && streamCopyToStream(process.stderr!).pipeTo(stderr),
    ]);
    return { code, signal: exitSignal };
  } finally {
    process.close();
  }
};

export const options: BazxOptions = {
  highWaterMark: 16640,
  noColors: Deno.noColor,
  log: (chunk) => Deno.stdout.writeSync(chunk),
};

export const $ = createBazx(exec, options);

export default $;

Deno.test({
  name: "everything works",
  async fn() {
    // @ts-ignore
    const assert: (expr: unknown, msg: string) => asserts expr =
      (await import("https://deno.land/std/testing/asserts.ts")).assert;
    // @ts-ignore
    const { fail, assertEquals } = await import(
      "https://deno.land/std/testing/asserts.ts"
    );

    const cmd = $`bash -c ${"echo Hello world! $(env | grep WTF) $(pwd)"}`
      .cwd("/bin")
      .pipe(
        new TransformStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Someone said: "));
          },
        }),
      )
      .env("WTF", "it works")
      .pipe($`sh -c ${"cat - $(realpath $(env | grep WTF))"}`)
      .env("WTF", "not_found")
      .cwd("/");

    try {
      await cmd.text();
      fail("Should have thrown since cat should have failed");
    } catch (err) {
      assertEquals(`Command ${cmd.command} exited with code 1`, err.message);
      assert(
        err.response instanceof Response,
        "err.response is defined and is an instance of Response",
      );
      assertEquals(
        "Someone said: Hello world! WTF=it works /bin\n",
        await err.response.text(),
      );
    }
  },
});
